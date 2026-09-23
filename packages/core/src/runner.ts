import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import {
  renderAgentCommand,
  renderAgentPrompt,
  loadSquadConfig,
  resolveAgent,
  resolveSquadPaths,
  type LoadedSquadConfig,
} from './config.js';
import {
  cleanupOrphanWorktrees,
  commitAll,
  createWorktree,
  listChangedFiles,
  removeWorktree,
  rollbackWorkingTree,
  runGit,
} from './git.js';
import { mergeRun, type MergeReport } from './merge.js';
import {
  buildConsultationPrompt,
  buildPlannerPrompt,
  buildSmartChatPrompt,
  cleanChatReply,
  extractJson,
  fileConflicts,
  parsePlanOutput,
  repoOverview,
  tryParsePlanOutput,
  validatePlan,
  type FileConflict,
} from './planner.js';
import { SquadStore } from './store.js';
import type { Plan, ReviewResult, SquadEvent, Task, TaskResult, TaskStatus } from './types.js';
import { ClarificationStage, TechLeadStage, DevOpsStage, type ClarificationResult, type TechLeadContract, type DevOpsReport } from './stages/index.js';
import { TaskLockManager, isPidAlive } from './lock.js';
import { HookPipeline } from './hooks.js';

/** Forcefully kills a process and all its descendants to avoid orphaned background tasks. */
export function killProcessTree(pid: number | undefined | null): void {
  if (!pid || pid <= 0) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }
}

/** Default deterministic verify commands mapped by specialist pipeline role. */
export const ROLE_DEFAULT_VERIFY_COMMANDS: Record<string, string> = {
  frontend: 'pnpm --filter @squad/web test',
  backend: 'pnpm --filter @squad/server test',
  database: 'pnpm --filter @squad/core test',
  devops: 'pnpm build',
  mobile: 'pnpm --filter @squad/mobile test',
};

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

  readonly clarificationStage = new ClarificationStage();
  readonly techLeadStage = new TechLeadStage();
  readonly devOpsStage = new DevOpsStage();
  readonly lockManager: TaskLockManager;
  readonly hooks: HookPipeline;

  constructor(private readonly options: SquadOrchestratorOptions) {
    super();
    if (typeof process.loadEnvFile === 'function') {
      const envPath = resolve(options.config.configDirectory, '.env');
      if (existsSync(envPath)) {
        try {
          process.loadEnvFile(envPath);
        } catch {}
      }
    }
    this.lockManager = new TaskLockManager(
      resolve(options.config.configDirectory, '.squad', 'locks'),
    );
    this.hooks = new HookPipeline();
  }

  /** Step 0: Evaluates whether the user's goal needs clarification before planning. */
  async clarifyGoal(goal: string): Promise<ClarificationResult> {
    return this.clarificationStage.evaluate(goal);
  }

  /** Tech Lead: Produces architecture and API contracts. */
  async produceArchitectureContract(goal: string, plan: Plan): Promise<TechLeadContract> {
    return this.techLeadStage.generateContract(goal, plan);
  }

  /** DevOps: Performs build verification and deployment handoff report. */
  async verifyDevOps(repoPath: string): Promise<DevOpsReport> {
    return this.devOpsStage.verifyAndHandoff(repoPath);
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

  /**
   * Intelligently handles user chat: either answers questions directly in Markdown or plans multi-agent tasks.
   */
  async chat(
    repoPath: string,
    message: string,
    mode: 'auto' | 'ask' | 'plan' = 'auto',
  ): Promise<
    | { type: 'answer'; reply: string }
    | { type: 'plan'; runId: string; plan: Plan; warnings: FileConflict[] }
  > {
    const overview = await repoOverview(repoPath);
    const agent = await resolveAgent(this.options.config, 'planner');

    let agentPrompt: string;
    if (mode === 'ask') {
      agentPrompt = buildConsultationPrompt(this.options.config.config, message, overview);
    } else if (mode === 'plan') {
      agentPrompt = buildPlannerPrompt(this.options.config.config, message, overview);
    } else {
      agentPrompt = buildSmartChatPrompt(this.options.config.config, message, overview);
    }

    const prompt = renderAgentPrompt(agent, agentPrompt);
    const command = renderAgentCommand(agent, prompt);
    const outputChunks: string[] = [];

    this.emit('plan:start', { type: 'plan:start', goal: message } satisfies SquadEvent);

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

    const rawOutput = outputChunks.join('');

    if (mode === 'ask') {
      return { type: 'answer', reply: cleanChatReply(rawOutput) };
    }

    if (mode === 'plan') {
      const plan = parsePlanOutput(rawOutput, message);
      const runId = randomUUID();
      this.options.store.createPlannedRun(runId, repoPath, plan);
      const warnings = fileConflicts(plan.tasks);
      this.emit('plan:done', { type: 'plan:done', runId, plan, warnings } satisfies SquadEvent);
      return { type: 'plan', runId, plan, warnings };
    }

    // mode === 'auto': try to parse as plan
    const maybePlan = tryParsePlanOutput(rawOutput, message);
    if (maybePlan && maybePlan.tasks && maybePlan.tasks.length > 0) {
      const runId = randomUUID();
      this.options.store.createPlannedRun(runId, repoPath, maybePlan);
      const warnings = fileConflicts(maybePlan.tasks);
      this.emit('plan:done', { type: 'plan:done', runId, plan: maybePlan, warnings } satisfies SquadEvent);
      return { type: 'plan', runId, plan: maybePlan, warnings };
    }

    return { type: 'answer', reply: cleanChatReply(rawOutput) };
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
      try {
        await cleanupOrphanWorktrees(repoPath, paths.worktreeDir);
      } catch {
        // Ignore initial cleanup error
      }
      await mkdir(resolve(paths.logDir, runId), { recursive: true });
      store.startPlannedRun(
        runId,
        plan,
        logPaths,
        { type: 'run:start', runId, plan },
        process.pid,
      );
      this.emit('run:start', { type: 'run:start', runId, plan } satisfies SquadEvent);

      const isDirect = config.config.executionMode !== 'worktree';
      if (isDirect) {
        try {
          await commitAll(repoPath, `squad: baseline before run ${runId}`);
        } catch {
          // ignore
        }
      }

      // Tech Lead Stage: generate architecture & API contract and enrich specialist dev tasks
      const techLeadContract = await this.techLeadStage.generateContract(plan.goal, plan);
      const executionTasks = this.techLeadStage.enrichTasksWithContract(plan.tasks, techLeadContract);

      while (results.size < executionTasks.length) {
        let progressed = false;

        for (const task of executionTasks) {
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

        if (results.size === executionTasks.length) {
          break;
        }

        if (running.size > 0) {
          await Promise.race(running.values());
          continue;
        }

        if (!progressed) {
          for (const task of executionTasks) {
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

      if (isDirect && (config.config.maxReviewRounds ?? 0) > 0) {
        await this.runQAReviewLoop(runId, repoPath, plan.goal, results, logPaths, paths.worktreeDir);
      }

      // DevOps Stage: Packaging & deployment verification before client handoff
      try {
        await this.devOpsStage.verifyAndHandoff(repoPath);
      } catch {
        // Non-blocking DevOps verification
      }

      const orderedResults = executionTasks.map((task) => results.get(task.id)).filter((r): r is TaskResult => r !== undefined);
      for (const [id, res] of results.entries()) {
        if (!orderedResults.some((r) => r.id === id)) {
          orderedResults.push(res);
        }
      }

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
    if (activeTask.child?.pid) {
      killProcessTree(activeTask.child.pid);
    } else {
      activeTask.child?.kill();
    }
  }

  /** Re-executes a failed or skipped task. */
  async retryTask(runId: string, repoPath: string, taskId: string): Promise<TaskResult> {
    const run = this.options.store.getRun(runId);
    if (!run || !run.plan) {
      throw new Error(`Run ${runId} or its plan not found.`);
    }
    const task = run.plan.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in run ${runId}.`);
    }

    const paths = resolveSquadPaths(this.options.config);
    const logPath = join(paths.logDir, runId, `${task.id}.log`);
    await mkdir(dirname(logPath), { recursive: true });

    const isDirect = this.options.config.config.executionMode !== 'worktree';
    if (!isDirect) {
      const targetDir = resolve(paths.worktreeDir, runId, task.id);
      try {
        await removeWorktree(repoPath, targetDir);
      } catch {}
      try {
        await runGit(repoPath, ['worktree', 'prune']);
      } catch {}
    }

    // Mark task running
    const startedAt = new Date().toISOString();
    this.options.store.recordTaskStarted(runId, task.id, startedAt, {
      type: 'task:start',
      runId,
      taskId: task.id,
    });
    this.emit('task:start', { type: 'task:start', runId, taskId: task.id } satisfies SquadEvent);

    const result = await this.executeTask(runId, repoPath, task, logPath, paths.worktreeDir);
    this.persistTaskResult(runId, result);

    const allTasks = this.options.store.listTasks(runId);
    const allPassed = allTasks.length > 0 && allTasks.every((t) => t.status === 'passed');
    if (allPassed) {
      this.options.store.completeRun(runId, 'completed', []);
    }

    return result;
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
    const isDirect = this.options.config.config.executionMode !== 'worktree';
    const targetDir = isDirect ? repoPath : resolve(worktreeRoot, runId, task.id);
    let status: TaskStatus = 'error';
    let errorMessage: string | undefined;
    let changedFiles: string[] | undefined;
    let agentName: string | undefined;
    let setupComplete = false;

    const lockAcquired = await this.lockManager.acquire(task.id);
    if (!lockAcquired) {
      const lockErrorMsg = `Task ${task.id} could not be acquired because another worker is currently executing it.`;
      const lockLog = `\n[squad:lock] ${lockErrorMsg}\n`;
      logChunks.push(lockLog);
      try {
        appendFileSync(logPath, lockLog, 'utf8');
      } catch {}
      return this.createTerminalResult(task, 'error', lockErrorMsg);
    }

    const lockAcquiredEvt: SquadEvent = {
      type: 'lock:acquired',
      runId,
      taskId: task.id,
      pid: process.pid,
    };
    this.options.store.appendEvent(lockAcquiredEvt);
    this.emit('lock:acquired', lockAcquiredEvt);

    try {
      this.activeTasks.set(task.id, activeTask);
      this.options.store.recordTaskStarted(runId, task.id, startedAt, {
        type: 'task:start',
        runId,
        taskId: task.id,
      });
      this.emit('task:start', { type: 'task:start', runId, taskId: task.id } satisfies SquadEvent);

      try {
        if (!isDirect) {
          await mkdir(dirname(targetDir), { recursive: true });
          try {
            await removeWorktree(repoPath, targetDir);
          } catch {
            // Ignore if worktree was not attached
          }
          await rm(targetDir, { recursive: true, force: true });
          await createWorktree(
            repoPath,
            targetDir,
            task.branch,
            this.options.config.config.baseBranch,
          );
          const wtCreateEvt: SquadEvent = {
            type: 'worktree:create',
            runId,
            taskId: task.id,
            worktreePath: targetDir,
          };
          this.options.store.appendEvent(wtCreateEvt);
          this.emit('worktree:create', wtCreateEvt);

          await this.copyConfiguredFiles(targetDir);
        }
        await this.runBootstrap(runId, task.id, targetDir, logPath, logChunks, activeTask);
        setupComplete = true;

        if (activeTask.cancelled) {
          status = 'cancelled';
        } else {
          const agent = await resolveAgent(this.options.config, task.role);
          agentName = agent.spec.cli ?? agent.spec.command?.[0];

          const targetFileList = task.files.length > 0
            ? `\n\nTarget Files for this task:\n${task.files.map((f) => `- ${f}`).join('\n')}\n`
            : '';

          const strictGuidelines = `
[TASK CONSTRAINTS & CODING GUIDELINES]
1. TARGET FILES: Focus strictly on the assigned target files. Do NOT modify, delete, or rewrite root configuration files (package.json, squad.config.json, tsconfig.json, vite.config.ts) unless specifically instructed.
2. TYPESCRIPT COMPILATION: Follow strict TypeScript rules. Every import must be used (no TS6133 unused variables/imports). Do NOT import React unless explicitly needed.
3. DEPENDENCIES: Never import packages that do not exist in package.json. If utility functions (e.g. cn class merging) are needed, check existing files (e.g. apps/web/src/lib/utils.ts) or implement lightweight pure TypeScript helpers without adding uninstalled third-party packages.
4. SYSTEM CONTINUITY: Keep the existing application components, UI shell, and routing intact. Integrate new visual styling or primitives harmoniously into the current layout without blanking out working features.
`;

          const taskPromptWithScope = `${task.prompt}${targetFileList}${strictGuidelines}`;
          const prompt = renderAgentPrompt(agent, taskPromptWithScope);
          const command = renderAgentCommand(agent, prompt);

          // Evaluate PreToolUse security hooks on target files
          const mode = this.options.config.config.permissionMode ?? 'restricted';
          let permissionDenied = false;
          for (const file of task.files) {
            const fileHook = await this.hooks.executePreHooks({
              runId,
              taskId: task.id,
              role: task.role,
              actionType: 'file_write',
              target: file,
              repoPath,
              mode,
              acceptanceTests: task.acceptanceTests,
            });
            const fileEvt: SquadEvent = {
              type: 'hook:evaluated',
              runId,
              taskId: task.id,
              actionType: 'file_write',
              target: file,
              decision: fileHook.decision,
              reason: fileHook.reason,
            };
            this.options.store.appendEvent(fileEvt);
            this.emit('hook:evaluated', fileEvt);

            if (fileHook.decision === 'deny') {
              status = 'agent_failed';
              errorMessage = `Permission denied: ${fileHook.reason}`;
              const denyMsg = `\n[squad:security] File access denied for '${file}': ${fileHook.reason}\n`;
              logChunks.push(denyMsg);
              try {
                appendFileSync(logPath, denyMsg, 'utf8');
              } catch {}
              permissionDenied = true;
              break;
            }
          }

          // Evaluate PreToolUse security hook on agent CLI command
          if (!permissionDenied && !activeTask.cancelled) {
            const cmdHook = await this.hooks.executePreHooks({
              runId,
              taskId: task.id,
              role: task.role,
              actionType: 'command_exec',
              target: command[0],
              repoPath,
              mode,
            });
            const cmdEvt: SquadEvent = {
              type: 'hook:evaluated',
              runId,
              taskId: task.id,
              actionType: 'command_exec',
              target: command[0],
              decision: cmdHook.decision,
              reason: cmdHook.reason,
            };
            this.options.store.appendEvent(cmdEvt);
            this.emit('hook:evaluated', cmdEvt);

            if (cmdHook.decision === 'deny') {
              status = 'agent_failed';
              errorMessage = `Command not permitted: ${cmdHook.reason}`;
              const denyMsg = `\n[squad:security] Command '${command[0]}' denied for role '${task.role}': ${cmdHook.reason}\n`;
              logChunks.push(denyMsg);
              try {
                appendFileSync(logPath, denyMsg, 'utf8');
              } catch {}
              permissionDenied = true;
            }
          }

          if (!permissionDenied && !activeTask.cancelled) {
            const agentResult = await this.runProcess(
              runId,
              task.id,
              logPath,
              logChunks,
              activeTask,
              command[0],
              command.slice(1),
              targetDir,
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
              const roleKey = task.role?.toLowerCase() ?? '';
              const roleVerify = ROLE_DEFAULT_VERIFY_COMMANDS[roleKey];
              const fallbackVerify = this.options.config.config.verify.join(' && ');
              const verifyCommand = task.verify || roleVerify || fallbackVerify;
              if (verifyCommand.length > 0) {
                const verifyResult = await this.runProcess(
                  runId,
                  task.id,
                  logPath,
                  logChunks,
                  activeTask,
                  verifyCommand,
                  [],
                  targetDir,
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
                  const verifyEvt: SquadEvent = {
                    type: 'verify:gate',
                    runId,
                    taskId: task.id,
                    status: 'failed',
                    error: errorMessage,
                  };
                  this.options.store.appendEvent(verifyEvt);
                  this.emit('verify:gate', verifyEvt);
                } else {
                  status = 'passed';
                  const verifyEvt: SquadEvent = {
                    type: 'verify:gate',
                    runId,
                    taskId: task.id,
                    status: 'passed',
                  };
                  this.options.store.appendEvent(verifyEvt);
                  this.emit('verify:gate', verifyEvt);
                }
              } else {
                status = 'passed';
              }
            }
          }
        }

        if (status === 'passed') {
          changedFiles = await listChangedFiles(targetDir);
          await commitAll(targetDir, `squad(${task.id}): ${task.title}`);
          if (!isDirect) {
            try {
              await removeWorktree(repoPath, targetDir);
              const wtCleanEvt: SquadEvent = {
                type: 'worktree:cleanup',
                runId,
                taskId: task.id,
                worktreePath: targetDir,
              };
              this.options.store.appendEvent(wtCleanEvt);
              this.emit('worktree:cleanup', wtCleanEvt);
            } catch {}
          }
        } else if (isDirect) {
          try {
            await rollbackWorkingTree(targetDir);
            const rollbackMsg = `\n[squad:direct] Task ${task.id} did not pass verification (${status}). Rolled back working tree to clean state.\n`;
            logChunks.push(rollbackMsg);
            appendFileSync(logPath, rollbackMsg, 'utf8');
            const event: SquadEvent = {
              type: 'task:log',
              runId,
              taskId: task.id,
              chunk: rollbackMsg,
            };
            this.options.store.appendEvent(event);
            this.emit('task:log', event);
          } catch {
            // ignore rollback error
          }
        } else {
          try {
            await removeWorktree(repoPath, targetDir);
            const wtCleanEvt: SquadEvent = {
              type: 'worktree:cleanup',
              runId,
              taskId: task.id,
              worktreePath: targetDir,
            };
            this.options.store.appendEvent(wtCleanEvt);
            this.emit('worktree:cleanup', wtCleanEvt);
          } catch {}
        }
      } catch (error) {
        status = activeTask.cancelled ? 'cancelled' : setupComplete ? 'error' : 'bootstrap_failed';
        errorMessage = this.errorMessage(error);
        if (isDirect) {
          try {
            await rollbackWorkingTree(targetDir);
          } catch {
            // ignore
          }
        } else {
          try {
            await removeWorktree(repoPath, targetDir);
            const wtCleanEvt: SquadEvent = {
              type: 'worktree:cleanup',
              runId,
              taskId: task.id,
              worktreePath: targetDir,
            };
            this.options.store.appendEvent(wtCleanEvt);
            this.emit('worktree:cleanup', wtCleanEvt);
          } catch {}
        }
      }

      if (status === 'cancelled') {
        if (isDirect) {
          try {
            await rollbackWorkingTree(targetDir);
          } catch {
            // ignore
          }
        } else {
          try {
            changedFiles = await listChangedFiles(targetDir);
            await commitAll(targetDir, `squad(${task.id}): WIP (cancelled by user)`);
            await removeWorktree(repoPath, targetDir);
            const wtCleanEvt: SquadEvent = {
              type: 'worktree:cleanup',
              runId,
              taskId: task.id,
              worktreePath: targetDir,
            };
            this.options.store.appendEvent(wtCleanEvt);
            this.emit('worktree:cleanup', wtCleanEvt);
          } catch (error) {
            errorMessage = `${errorMessage === undefined ? '' : `${errorMessage} `}Could not commit cancelled WIP: ${this.errorMessage(error)}`;
          }
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
    } finally {
      await this.lockManager.release(task.id);
      const lockReleasedEvt: SquadEvent = {
        type: 'lock:released',
        runId,
        taskId: task.id,
      };
      this.options.store.appendEvent(lockReleasedEvt);
      this.emit('lock:released', lockReleasedEvt);
    }
  }

  private async copyConfiguredFiles(worktreePath: string): Promise<void> {
    const { configDirectory } = this.options.config;
    const { copyFiles } = resolveSquadPaths(this.options.config);

    for (const sourcePath of copyFiles) {
      if (!existsSync(sourcePath)) {
        continue;
      }
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
          if (child.pid) {
            killProcessTree(child.pid);
          } else {
            child.kill();
          }
        }
      }

      let settled = false;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        if (child.pid) {
          killProcessTree(child.pid);
        } else {
          child.kill();
        }
      }, this.options.config.config.timeoutMinutes * 60_000);

      const reportChunk = (chunk: Buffer | string): void => {
        try {
          onChunk?.(chunk);
        } catch (error) {
          if (activeTask !== undefined) {
            activeTask.logWriteError = error instanceof Error ? error : new Error(String(error));
          }
          if (child.pid) {
            killProcessTree(child.pid);
          } else {
            child.kill();
          }
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

  private async runQAReviewLoop(
    runId: string,
    repoPath: string,
    goal: string,
    results: Map<string, TaskResult>,
    logPaths: Map<string, string>,
    worktreeRoot: string,
  ): Promise<void> {
    const { config, store } = this.options;
    const maxRounds = config.config.maxReviewRounds ?? 2;
    if (maxRounds <= 0) {
      return;
    }

    const paths = resolveSquadPaths(config);

    for (let round = 1; round <= maxRounds; round++) {
      this.emit('review:start', { type: 'review:start', runId, round } satisfies SquadEvent);

      let verifySummary = 'No verify command configured.';
      let verifyPassed = true;
      const verifyCommands = config.config.verify;
      if (verifyCommands.length > 0) {
        try {
          const verifyOutputChunks: string[] = [];
          const activeTask: ActiveTask = { cancelled: false, finalized: false };
          const verifyLogPath = resolve(paths.logDir, runId, `review-${round}-verify.log`);
          const verifyResult = await this.spawnProcess(
            verifyCommands.join(' && '),
            [],
            repoPath,
            undefined,
            true,
            activeTask,
            (chunk) => {
              const text = chunk.toString();
              verifyOutputChunks.push(text);
              try {
                appendFileSync(verifyLogPath, text, 'utf8');
              } catch {}
              this.emit('review:log', { type: 'review:log', runId, round, chunk: text } satisfies SquadEvent);
            },
          );
          verifyPassed = verifyResult.exitCode === 0 && !verifyResult.timedOut;
          verifySummary = `Verify (${verifyCommands.join(' && ')}): ${verifyPassed ? 'PASSED' : 'FAILED'}\nOutput:\n${verifyOutputChunks.join('').slice(-2000)}`;
        } catch (err) {
          verifyPassed = false;
          verifySummary = `Verify error: ${this.errorMessage(err)}`;
        }
      }

      let gitSummary = '';
      try {
        const { stdout: statusOut } = await runGit(repoPath, ['status', '--short']);
        gitSummary = `Git status:\n${statusOut.slice(0, 1500)}`;
      } catch {
        gitSummary = '';
      }

      const reviewerAgent = await resolveAgent(config, 'reviewer');
      const taskResultsSummary = [...results.values()]
        .map((r) => `- [${r.status.toUpperCase()}] ${r.id}: ${r.title} ${r.error ? `(Error: ${r.error})` : ''}`)
        .join('\n');

      const reviewPrompt = `Bạn là Lead QA / Inspector chịu trách nhiệm nghiệm thu kết quả dự án.

MỤC TIÊU BAN ĐẦU:
${goal}

KẾT QUẢ CÁC TASK ĐÃ THỰC HIỆN:
${taskResultsSummary}

KẾT QUẢ KIỂM THỬ / BUILD HỆ THỐNG:
${verifySummary}

${gitSummary}

VÒNG NGHIỆM THU: ${round}/${maxRounds}

NHIỆM VỤ CỦA BẠN:
1. Đánh giá xem mục tiêu ban đầu đã được hoàn thành đầy đủ, chính xác và không còn lỗi chưa.
2. Nếu TẤT CẢ đã hoàn thành tốt, không còn lỗi: trả về status "passed" và tóm tắt ngắn gọn.
3. Nếu phát hiện lỗi hoặc thiếu sót: trả về status "needs_fix" kèm danh sách các "fixTasks" cụ thể để các agent sửa chữa. Mỗi fix task cần ghi rõ role, files, prompt chi tiết và verify.

CHỈ TRẢ VỀ JSON THUẦN:
{
  "status": "passed",
  "summary": "Tất cả yêu cầu đã được đáp ứng."
}
HOẶC:
{
  "status": "needs_fix",
  "summary": "Phát hiện lỗi ...",
  "fixTasks": [
    {
      "id": "fix-${round}-1",
      "title": "Tên công việc sửa lỗi",
      "role": "frontend",
      "files": ["path/to/file"],
      "prompt": "Hướng dẫn chi tiết sửa lỗi...",
      "verify": "lệnh shell kiểm tra lại hoặc bỏ trống"
    }
  ]
}`;

      const renderedPrompt = renderAgentPrompt(reviewerAgent, reviewPrompt);
      const command = renderAgentCommand(reviewerAgent, renderedPrompt);
      const qaOutputChunks: string[] = [];
      const qaActiveTask: ActiveTask = { cancelled: false, finalized: false };
      const qaLogPath = resolve(paths.logDir, runId, `review-${round}.log`);

      try {
        await this.spawnProcess(
          command[0],
          command.slice(1),
          repoPath,
          reviewerAgent.spec.env,
          false,
          qaActiveTask,
          (chunk) => {
            const text = chunk.toString();
            qaOutputChunks.push(text);
            try {
              appendFileSync(qaLogPath, text, 'utf8');
            } catch {}
            this.emit('review:log', { type: 'review:log', runId, round, chunk: text } satisfies SquadEvent);
          },
        );
      } catch {
        // Fallback if reviewer process fails
      }

      const qaOutputText = qaOutputChunks.join('');
      let parsedReview: ReviewResult = { status: 'passed', summary: 'QA review passed.' };
      try {
        const jsonStr = extractJson(qaOutputText);
        const parsed = JSON.parse(jsonStr);
        if (parsed.status === 'needs_fix' && Array.isArray(parsed.fixTasks) && parsed.fixTasks.length > 0) {
          parsedReview = {
            status: 'needs_fix',
            summary: parsed.summary || 'QA phát hiện các điểm cần khắc phục.',
            fixTasks: parsed.fixTasks.map((t: any, idx: number) => ({
              id: t.id || `fix-${round}-${idx + 1}`,
              title: t.title || `Khắc phục lỗi #${idx + 1}`,
              role: t.role || 'default',
              files: Array.isArray(t.files) ? t.files : [],
              dependsOn: [],
              prompt: t.prompt || '',
              verify: t.verify,
              branch: `squad/fix-${round}-${idx + 1}`,
            })),
          };
        } else {
          parsedReview = {
            status: 'passed',
            summary: parsed.summary || (verifyPassed ? 'Tất cả yêu cầu đã được đáp ứng và kiểm thử thành công.' : 'QA hoàn tất đánh giá.'),
          };
        }
      } catch {
        parsedReview = {
          status: verifyPassed ? 'passed' : 'needs_fix',
          summary: qaOutputText.slice(0, 300) || 'QA review hoàn thành.',
        };
      }

      this.emit('review:done', { type: 'review:done', runId, round, result: parsedReview } satisfies SquadEvent);

      if (parsedReview.status === 'passed' || !parsedReview.fixTasks || parsedReview.fixTasks.length === 0) {
        break;
      }

      for (const fixTask of parsedReview.fixTasks) {
        const fixLogPath = resolve(paths.logDir, runId, `${fixTask.id}.log`);
        logPaths.set(fixTask.id, fixLogPath);
        store.createTask(runId, fixTask, fixLogPath);
        const taskRes = await this.executeTask(runId, repoPath, fixTask, fixLogPath, worktreeRoot);
        results.set(fixTask.id, taskRes);
      }
    }
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
