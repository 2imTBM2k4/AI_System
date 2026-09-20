import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import {
  renderAgentCommand,
  renderAgentPrompt,
  loadSquadConfig,
  resolveAgent,
  resolveSquadPaths,
  type LoadedSquadConfig,
} from './config.js';
import { commitAll, createWorktree, listChangedFiles } from './git.js';
import { mergeRun, type MergeReport } from './merge.js';
import {
  buildPlannerPrompt,
  fileConflicts,
  parsePlanOutput,
  repoOverview,
  validatePlan,
  type FileConflict,
} from './planner.js';
import { SquadStore } from './store.js';
import type { Plan, SquadEvent, Task, TaskResult, TaskStatus } from './types.js';

interface ActiveTask {
  child?: ChildProcess;
  cancelled: boolean;
  finalized: boolean;
  logWriteError?: Error;
}

interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

export interface SquadOrchestratorOptions {
  config: LoadedSquadConfig;
  store: SquadStore;
}

export class RunnerError extends Error {
  readonly code: 'RUN_ALREADY_ACTIVE';

  constructor(code: RunnerError['code'], message: string) {
    super(message);
    this.name = 'RunnerError';
    this.code = code;
  }
}

/** Reconciles runs whose owning coordinator process no longer exists. */
export async function reconcileOrphanedTasks(repoPath: string): Promise<string[]> {
  const config = await loadSquadConfig(resolve(repoPath, 'squad.config.json'));
  const store = await SquadStore.open(resolveSquadPaths(config).dbFile);
  try {
    const interruptedRunIds: string[] = [];
    for (const run of store.listRunningRuns()) {
      if (!isProcessAlive(run.pid) && store.interruptRun(run.id)) {
        interruptedRunIds.push(run.id);
      }
    }
    return interruptedRunIds;
  } finally {
    store.close();
  }
}

/** Coordinates task worktrees and processes while persisting state before every event. */
export class SquadOrchestrator extends EventEmitter {
  private readonly activeTasks = new Map<string, ActiveTask>();
  private currentRunId?: string;

  constructor(private readonly options: SquadOrchestratorOptions) {
    super();
  }

  async makePlan(
    repoPath: string,
    goal: string,
  ): Promise<{ runId: string; plan: Plan; warnings: FileConflict[] }> {
    this.emit('plan:start', { type: 'plan:start', goal } satisfies SquadEvent);
    const overview = await repoOverview(repoPath);
    const agent = await resolveAgent(this.options.config, 'planner');
    const prompt = renderAgentPrompt(
      agent,
      buildPlannerPrompt(this.options.config.config, goal, overview),
    );
    const command = renderAgentCommand(agent, prompt);
    const outputChunks: string[] = [];
    const processResult = await this.spawnProcess(
      command[0],
      command.slice(1),
      repoPath,
      agent.spec.env,
      false,
      undefined,
      (chunk) => {
        const text = chunk.toString();
        outputChunks.push(text);
        this.emit('plan:log', { type: 'plan:log', chunk: text } satisfies SquadEvent);
      },
    );
    if (processResult.exitCode !== 0 || processResult.timedOut) {
      const outputText = outputChunks.join('').trim();
      const failureMsg = this.processFailureMessage(processResult);
      throw new Error(
        processResult.timedOut
          ? `Planner timed out after ${this.options.config.config.timeoutMinutes} minutes.`
          : outputText
          ? `${failureMsg} Chi tiết: ${outputText.slice(-500)}`
          : failureMsg,
      );
    }

    const plan = parsePlanOutput(outputChunks.join(''), goal);
    const runId = randomUUID();
    this.options.store.createPlannedRun(runId, repoPath, plan);
    const warnings = fileConflicts(plan.tasks);
    this.emit('plan:done', { type: 'plan:done', runId, plan, warnings } satisfies SquadEvent);
    return { runId, plan, warnings };
  }

  /** Persists a hand-edited plan without invoking the planner agent. */
  async createRunFromPlan(repoPath: string, plan: Plan): Promise<{ runId: string }> {
    const validatedPlan = validatePlan(plan, plan.goal);
    const runId = randomUUID();
    this.options.store.createPlannedRun(runId, repoPath, validatedPlan);
    const warnings = fileConflicts(validatedPlan.tasks);
    this.emit(
      'plan:done',
      { type: 'plan:done', runId, plan: validatedPlan, warnings } satisfies SquadEvent,
    );
    return { runId };
  }

  async mergeAll(runId: string): Promise<MergeReport> {
    return mergeRun({ runId, config: this.options.config, store: this.options.store });
  }

  async runPlan(repoPath: string, plan: Plan, runId: string): Promise<TaskResult[]> {
    if (this.currentRunId !== undefined) {
      throw new RunnerError('RUN_ALREADY_ACTIVE', 'This orchestrator already has an active run.');
    }

    const { config, store } = this.options;
    const paths = resolveSquadPaths(config);
    const logPaths = new Map(
      plan.tasks.map((task) => [task.id, resolve(paths.logDir, runId, `${task.id}.log`)]),
    );
    const results = new Map<string, TaskResult>();
    const running = new Map<string, Promise<void>>();

    this.currentRunId = runId;
    try {
      await mkdir(resolve(paths.logDir, runId), { recursive: true });
      store.startPlannedRun(
        runId,
        plan,
        logPaths,
        { type: 'run:start', runId, plan },
        process.pid,
      );
      this.emit('run:start', { type: 'run:start', runId, plan } satisfies SquadEvent);

      while (results.size < plan.tasks.length) {
        let progressed = false;

        for (const task of plan.tasks) {
          if (results.has(task.id) || running.has(task.id)) {
            continue;
          }

          const dependencyResults = task.dependsOn.map((dependencyId) => results.get(dependencyId));
          if (dependencyResults.some((result) => result === undefined)) {
            continue;
          }

          if (dependencyResults.some((result) => result?.status !== 'passed')) {
            const result = this.createTerminalResult(
              task,
              'skipped',
              'Skipped because at least one dependency did not pass.',
            );
            this.persistTaskResult(runId, result);
            results.set(task.id, result);
            progressed = true;
            continue;
          }

          if (running.size >= config.config.maxParallel) {
            continue;
          }

          const logPath = logPaths.get(task.id);
          if (logPath === undefined) {
            throw new Error(`Missing log path for task ${task.id}.`);
          }

          const execution = this.executeTask(runId, repoPath, task, logPath, paths.worktreeDir)
            .then((result) => {
              results.set(task.id, result);
            })
            .finally(() => {
              running.delete(task.id);
            });
          running.set(task.id, execution);
          progressed = true;
        }

        if (results.size === plan.tasks.length) {
          break;
        }

        if (running.size > 0) {
          await Promise.race(running.values());
          continue;
        }

        if (!progressed) {
          for (const task of plan.tasks) {
            if (results.has(task.id)) {
              continue;
            }

            const result = this.createTerminalResult(
              task,
              'error',
              'Task could not be scheduled because its dependencies never became terminal.',
            );
            this.persistTaskResult(runId, result);
            results.set(task.id, result);
          }
        }
      }

      const orderedResults = plan.tasks.map((task) => {
        const result = results.get(task.id);
        if (result === undefined) {
          throw new Error(`Task ${task.id} did not produce a result.`);
        }

        return result;
      });
      store.completeRun(runId, 'completed', orderedResults);
      this.emit('run:done', { type: 'run:done', runId, results: orderedResults } satisfies SquadEvent);
      return orderedResults;
    } finally {
      this.currentRunId = undefined;
    }
  }

  /** Requests cancellation; the close handler owns the single final state transition. */
  cancelTask(taskId: string): void {
    const activeTask = this.activeTasks.get(taskId);
    if (activeTask === undefined || activeTask.finalized) {
      return;
    }

    activeTask.cancelled = true;
    activeTask.child?.kill();
  }

  private async executeTask(
    runId: string,
    repoPath: string,
    task: Task,
    logPath: string,
    worktreeRoot: string,
  ): Promise<TaskResult> {
    const activeTask: ActiveTask = { cancelled: false, finalized: false };
    const startedAt = new Date().toISOString();
    const logChunks: string[] = [];
    const worktreePath = resolve(worktreeRoot, runId, task.id);
    let status: TaskStatus = 'error';
    let errorMessage: string | undefined;
    let changedFiles: string[] | undefined;
    let agentName: string | undefined;
    let setupComplete = false;

    this.activeTasks.set(task.id, activeTask);
    this.options.store.recordTaskStarted(runId, task.id, startedAt, {
      type: 'task:start',
      runId,
      taskId: task.id,
    });
    this.emit('task:start', { type: 'task:start', runId, taskId: task.id } satisfies SquadEvent);

    try {
      await mkdir(dirname(worktreePath), { recursive: true });
      await createWorktree(
        repoPath,
        worktreePath,
        task.branch,
        this.options.config.config.baseBranch,
      );
      await this.copyConfiguredFiles(worktreePath);
      await this.runBootstrap(runId, task.id, worktreePath, logPath, logChunks, activeTask);
      setupComplete = true;

      if (activeTask.cancelled) {
        status = 'cancelled';
      } else {
        const agent = await resolveAgent(this.options.config, task.role);
        agentName = agent.spec.cli ?? agent.spec.command?.[0];
        const prompt = renderAgentPrompt(agent, task.prompt);
        const command = renderAgentCommand(agent, prompt);
        const agentResult = await this.runProcess(
          runId,
          task.id,
          logPath,
          logChunks,
          activeTask,
          command[0],
          command.slice(1),
          worktreePath,
          agent.spec.env,
          false,
          true,
        );

        if (activeTask.cancelled) {
          status = 'cancelled';
        } else if (activeTask.logWriteError !== undefined) {
          status = 'error';
          errorMessage = activeTask.logWriteError.message;
        } else if (agentResult.timedOut) {
          status = 'agent_failed';
          errorMessage = `Agent timed out after ${this.options.config.config.timeoutMinutes} minutes.`;
        } else if (agentResult.exitCode !== 0) {
          status = 'agent_failed';
          errorMessage = this.processFailureMessage(agentResult);
        } else {
          const verifyCommand = task.verify || this.options.config.config.verify.join(' && ');
          if (verifyCommand.length > 0) {
            const verifyResult = await this.runProcess(
              runId,
              task.id,
              logPath,
              logChunks,
              activeTask,
              verifyCommand,
              [],
              worktreePath,
              undefined,
              true,
            );
            if (activeTask.cancelled) {
              status = 'cancelled';
            } else if (verifyResult.timedOut || verifyResult.exitCode !== 0) {
              status = 'verify_failed';
              errorMessage = verifyResult.timedOut
                ? `Verify command timed out after ${this.options.config.config.timeoutMinutes} minutes.`
                : this.processFailureMessage(verifyResult);
            } else {
              status = 'passed';
            }
          } else {
            status = 'passed';
          }
        }
      }

      if (status === 'passed') {
        changedFiles = await listChangedFiles(worktreePath);
        await commitAll(worktreePath, `squad(${task.id}): ${task.title}`);
      }
    } catch (error) {
      status = activeTask.cancelled ? 'cancelled' : setupComplete ? 'error' : 'bootstrap_failed';
      errorMessage = this.errorMessage(error);
    }

    if (status === 'cancelled') {
      try {
        changedFiles = await listChangedFiles(worktreePath);
        await commitAll(worktreePath, `squad(${task.id}): WIP (cancelled by user)`);
      } catch (error) {
        errorMessage = `${errorMessage === undefined ? '' : `${errorMessage} `}Could not commit cancelled WIP: ${this.errorMessage(error)}`;
      }
    }

    const result: TaskResult = {
      ...task,
      status,
      log: logChunks.join(''),
      startedAt,
      endedAt: new Date().toISOString(),
      ...(changedFiles === undefined ? {} : { changedFiles }),
      ...(agentName === undefined ? {} : { agent: agentName }),
      ...(errorMessage === undefined ? {} : { error: errorMessage }),
    };
    return this.finalizeTask(runId, result, activeTask);
  }

  private async copyConfiguredFiles(worktreePath: string): Promise<void> {
    const { configDirectory } = this.options.config;
    const { copyFiles } = resolveSquadPaths(this.options.config);

    for (const sourcePath of copyFiles) {
      const relativePath = relative(configDirectory, sourcePath);
      if (
        relativePath.length === 0 ||
        relativePath === '..' ||
        relativePath.startsWith('..\\') ||
        relativePath.startsWith('../') ||
        isAbsolute(relativePath)
      ) {
        throw new Error(`copyFiles entry must stay inside the config directory: ${sourcePath}`);
      }

      const destinationPath = resolve(worktreePath, relativePath);
      await mkdir(dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);
    }
  }

  private async runBootstrap(
    runId: string,
    taskId: string,
    cwd: string,
    logPath: string,
    logChunks: string[],
    activeTask: ActiveTask,
  ): Promise<void> {
    for (const command of this.options.config.config.bootstrap) {
      if (activeTask.cancelled) {
        return;
      }

      const result = await this.runProcess(
        runId,
        taskId,
        logPath,
        logChunks,
        activeTask,
        command,
        [],
        cwd,
        undefined,
        true,
      );
      if (activeTask.cancelled) {
        return;
      }
      if (result.timedOut || result.exitCode !== 0) {
        throw new Error(
          result.timedOut
            ? `Bootstrap command timed out after ${this.options.config.config.timeoutMinutes} minutes.`
            : this.processFailureMessage(result),
        );
      }
    }
  }

  private runProcess(
    runId: string,
    taskId: string,
    logPath: string,
    logChunks: string[],
    activeTask: ActiveTask,
    executable: string,
    args: string[],
    cwd: string,
    env: Record<string, string> | undefined,
    shell = false,
    recordAgentPid = false,
  ): Promise<ProcessResult> {
    return this.spawnProcess(
      executable,
      args,
      cwd,
      env,
      shell,
      activeTask,
      (chunk) => {
        const text = chunk.toString();
        logChunks.push(text);
        try {
          appendFileSync(logPath, text, 'utf8');
          const event: SquadEvent = { type: 'task:log', runId, taskId, chunk: text };
          this.options.store.appendEvent(event);
          this.emit('task:log', event);
        } catch (error) {
          activeTask.logWriteError = error instanceof Error ? error : new Error(String(error));
          activeTask.child?.kill();
        }
      },
      recordAgentPid
        ? (pid) => {
            this.options.store.setTaskPid(runId, taskId, pid);
          }
        : undefined,
      recordAgentPid
        ? () => {
            this.options.store.setTaskPid(runId, taskId, null);
          }
        : undefined,
    );
  }

  /** Shared process lifecycle for planner and task execution; callers decide persistence. */
  private spawnProcess(
    executable: string,
    args: string[],
    cwd: string,
    env: Record<string, string> | undefined,
    shell: boolean,
    activeTask?: ActiveTask,
    onChunk?: (chunk: Buffer | string) => void,
    onSpawn?: (pid: number) => void,
    onClose?: () => void,
  ): Promise<ProcessResult> {
    return new Promise((resolveProcess) => {
      if (activeTask?.cancelled) {
        resolveProcess({ exitCode: null, signal: null, timedOut: false });
        return;
      }

      const child = spawn(executable, args, {
        cwd,
        env: { ...process.env, ...env },
        shell,
        windowsHide: true,
      });
      // Non-interactive agent CLIs may keep reading stdin even when the prompt is in argv.
      // Close the inherited pipe so they receive EOF instead of waiting for terminal input.
      child.stdin?.end();
      if (activeTask !== undefined) {
        activeTask.child = child;
      }
      if (child.pid !== undefined) {
        try {
          onSpawn?.(child.pid);
        } catch (error) {
          if (activeTask !== undefined) {
            activeTask.logWriteError = error instanceof Error ? error : new Error(String(error));
          }
          child.kill();
        }
      }

      let settled = false;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, this.options.config.config.timeoutMinutes * 60_000);

      const reportChunk = (chunk: Buffer | string): void => {
        try {
          onChunk?.(chunk);
        } catch (error) {
          if (activeTask !== undefined) {
            activeTask.logWriteError = error instanceof Error ? error : new Error(String(error));
          }
          child.kill();
        }
      };
      child.stdout?.on('data', reportChunk);
      child.stderr?.on('data', reportChunk);

      const settle = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        if (activeTask?.child === child) {
          activeTask.child = undefined;
        }
        onClose?.();
        resolveProcess({ exitCode, signal, timedOut });
      };

      child.once('error', (error) => {
        if (activeTask !== undefined && activeTask.logWriteError === undefined) {
          activeTask.logWriteError = error;
        }
        settle(null, null);
      });
      child.once('close', settle);
    });
  }

  private finalizeTask(runId: string, result: TaskResult, activeTask: ActiveTask): TaskResult {
    if (activeTask.finalized) {
      return result;
    }

    activeTask.finalized = true;
    this.activeTasks.delete(result.id);
    const event: SquadEvent = { type: 'task:done', runId, result };
    this.options.store.recordTaskResult(runId, result, event);
    this.emit('task:done', event);
    return result;
  }

  private persistTaskResult(runId: string, result: TaskResult): void {
    const event: SquadEvent = { type: 'task:done', runId, result };
    this.options.store.recordTaskResult(runId, result, event);
    this.emit('task:done', event);
  }

  private createTerminalResult(task: Task, status: TaskStatus, error: string): TaskResult {
    const timestamp = new Date().toISOString();
    return {
      ...task,
      status,
      log: '',
      startedAt: timestamp,
      endedAt: timestamp,
      error,
    };
  }

  private processFailureMessage(result: ProcessResult): string {
    return result.signal === null
      ? `Process exited with code ${result.exitCode ?? 'unknown'}.`
      : `Process exited after signal ${result.signal}.`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function isProcessAlive(pid: number | null): boolean {
  if (pid === null || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}
