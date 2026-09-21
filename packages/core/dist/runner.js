import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { renderAgentCommand, renderAgentPrompt, loadSquadConfig, resolveAgent, resolveSquadPaths, } from './config.js';
import { commitAll, createWorktree, listChangedFiles, removeWorktree, runGit } from './git.js';
import { mergeRun } from './merge.js';
import { buildPlannerPrompt, extractJson, fileConflicts, parsePlanOutput, repoOverview, validatePlan, } from './planner.js';
import { SquadStore } from './store.js';
export class RunnerError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'RunnerError';
        this.code = code;
    }
}
/** Reconciles runs whose owning coordinator process no longer exists. */
export async function reconcileOrphanedTasks(repoPath) {
    const config = await loadSquadConfig(resolve(repoPath, 'squad.config.json'));
    const store = await SquadStore.open(resolveSquadPaths(config).dbFile);
    try {
        const interruptedRunIds = [];
        for (const run of store.listRunningRuns()) {
            if (!isProcessAlive(run.pid) && store.interruptRun(run.id)) {
                interruptedRunIds.push(run.id);
            }
        }
        return interruptedRunIds;
    }
    finally {
        store.close();
    }
}
/** Coordinates task worktrees and processes while persisting state before every event. */
export class SquadOrchestrator extends EventEmitter {
    options;
    activeTasks = new Map();
    currentRunId;
    constructor(options) {
        super();
        this.options = options;
    }
    async makePlan(repoPath, goal) {
        this.emit('plan:start', { type: 'plan:start', goal });
        const overview = await repoOverview(repoPath);
        const agent = await resolveAgent(this.options.config, 'planner');
        const prompt = renderAgentPrompt(agent, buildPlannerPrompt(this.options.config.config, goal, overview));
        const command = renderAgentCommand(agent, prompt);
        const outputChunks = [];
        const processResult = await this.spawnProcess(command[0], command.slice(1), repoPath, agent.spec.env, false, undefined, (chunk) => {
            const text = chunk.toString();
            outputChunks.push(text);
            this.emit('plan:log', { type: 'plan:log', chunk: text });
        });
        if (processResult.exitCode !== 0 || processResult.timedOut) {
            const outputText = outputChunks.join('').trim();
            const failureMsg = this.processFailureMessage(processResult);
            throw new Error(processResult.timedOut
                ? `Planner timed out after ${this.options.config.config.timeoutMinutes} minutes.`
                : outputText
                    ? `${failureMsg} Chi tiết: ${outputText.slice(-500)}`
                    : failureMsg);
        }
        const plan = parsePlanOutput(outputChunks.join(''), goal);
        const runId = randomUUID();
        this.options.store.createPlannedRun(runId, repoPath, plan);
        const warnings = fileConflicts(plan.tasks);
        this.emit('plan:done', { type: 'plan:done', runId, plan, warnings });
        return { runId, plan, warnings };
    }
    /** Persists a hand-edited plan without invoking the planner agent. */
    async createRunFromPlan(repoPath, plan) {
        const validatedPlan = validatePlan(plan, plan.goal);
        const runId = randomUUID();
        this.options.store.createPlannedRun(runId, repoPath, validatedPlan);
        const warnings = fileConflicts(validatedPlan.tasks);
        this.emit('plan:done', { type: 'plan:done', runId, plan: validatedPlan, warnings });
        return { runId };
    }
    async mergeAll(runId) {
        return mergeRun({ runId, config: this.options.config, store: this.options.store });
    }
    async runPlan(repoPath, plan, runId) {
        if (this.currentRunId !== undefined) {
            throw new RunnerError('RUN_ALREADY_ACTIVE', 'This orchestrator already has an active run.');
        }
        const { config, store } = this.options;
        const paths = resolveSquadPaths(config);
        const logPaths = new Map(plan.tasks.map((task) => [task.id, resolve(paths.logDir, runId, `${task.id}.log`)]));
        const results = new Map();
        const running = new Map();
        this.currentRunId = runId;
        try {
            await mkdir(resolve(paths.logDir, runId), { recursive: true });
            store.startPlannedRun(runId, plan, logPaths, { type: 'run:start', runId, plan }, process.pid);
            this.emit('run:start', { type: 'run:start', runId, plan });
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
                        const result = this.createTerminalResult(task, 'skipped', 'Skipped because at least one dependency did not pass.');
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
                        const result = this.createTerminalResult(task, 'error', 'Task could not be scheduled because its dependencies never became terminal.');
                        this.persistTaskResult(runId, result);
                        results.set(task.id, result);
                    }
                }
            }
            const isDirect = config.config.executionMode !== 'worktree';
            if (isDirect && (config.config.maxReviewRounds ?? 0) > 0) {
                await this.runQAReviewLoop(runId, repoPath, plan.goal, results, logPaths, paths.worktreeDir);
            }
            const orderedResults = plan.tasks.map((task) => results.get(task.id)).filter((r) => r !== undefined);
            for (const [id, res] of results.entries()) {
                if (!orderedResults.some((r) => r.id === id)) {
                    orderedResults.push(res);
                }
            }
            store.completeRun(runId, 'completed', orderedResults);
            this.emit('run:done', { type: 'run:done', runId, results: orderedResults });
            return orderedResults;
        }
        finally {
            this.currentRunId = undefined;
        }
    }
    /** Requests cancellation; the close handler owns the single final state transition. */
    cancelTask(taskId) {
        const activeTask = this.activeTasks.get(taskId);
        if (activeTask === undefined || activeTask.finalized) {
            return;
        }
        activeTask.cancelled = true;
        activeTask.child?.kill();
    }
    async executeTask(runId, repoPath, task, logPath, worktreeRoot) {
        const activeTask = { cancelled: false, finalized: false };
        const startedAt = new Date().toISOString();
        const logChunks = [];
        const isDirect = this.options.config.config.executionMode !== 'worktree';
        const targetDir = isDirect ? repoPath : resolve(worktreeRoot, runId, task.id);
        let status = 'error';
        let errorMessage;
        let changedFiles;
        let agentName;
        let setupComplete = false;
        this.activeTasks.set(task.id, activeTask);
        this.options.store.recordTaskStarted(runId, task.id, startedAt, {
            type: 'task:start',
            runId,
            taskId: task.id,
        });
        this.emit('task:start', { type: 'task:start', runId, taskId: task.id });
        try {
            if (!isDirect) {
                await mkdir(dirname(targetDir), { recursive: true });
                try {
                    await removeWorktree(repoPath, targetDir);
                }
                catch {
                    // Ignore if worktree was not attached
                }
                await rm(targetDir, { recursive: true, force: true });
                await createWorktree(repoPath, targetDir, task.branch, this.options.config.config.baseBranch);
                await this.copyConfiguredFiles(targetDir);
            }
            await this.runBootstrap(runId, task.id, targetDir, logPath, logChunks, activeTask);
            setupComplete = true;
            if (activeTask.cancelled) {
                status = 'cancelled';
            }
            else {
                const agent = await resolveAgent(this.options.config, task.role);
                agentName = agent.spec.cli ?? agent.spec.command?.[0];
                const prompt = renderAgentPrompt(agent, task.prompt);
                const command = renderAgentCommand(agent, prompt);
                const agentResult = await this.runProcess(runId, task.id, logPath, logChunks, activeTask, command[0], command.slice(1), targetDir, agent.spec.env, false, true);
                if (activeTask.cancelled) {
                    status = 'cancelled';
                }
                else if (activeTask.logWriteError !== undefined) {
                    status = 'error';
                    errorMessage = activeTask.logWriteError.message;
                }
                else if (agentResult.timedOut) {
                    status = 'agent_failed';
                    errorMessage = `Agent timed out after ${this.options.config.config.timeoutMinutes} minutes.`;
                }
                else if (agentResult.exitCode !== 0) {
                    status = 'agent_failed';
                    errorMessage = this.processFailureMessage(agentResult);
                }
                else {
                    const verifyCommand = task.verify || this.options.config.config.verify.join(' && ');
                    if (verifyCommand.length > 0) {
                        const verifyResult = await this.runProcess(runId, task.id, logPath, logChunks, activeTask, verifyCommand, [], targetDir, undefined, true);
                        if (activeTask.cancelled) {
                            status = 'cancelled';
                        }
                        else if (verifyResult.timedOut || verifyResult.exitCode !== 0) {
                            status = 'verify_failed';
                            errorMessage = verifyResult.timedOut
                                ? `Verify command timed out after ${this.options.config.config.timeoutMinutes} minutes.`
                                : this.processFailureMessage(verifyResult);
                        }
                        else {
                            status = 'passed';
                        }
                    }
                    else {
                        status = 'passed';
                    }
                }
            }
            if (status === 'passed') {
                changedFiles = await listChangedFiles(targetDir);
                await commitAll(targetDir, `squad(${task.id}): ${task.title}`);
            }
        }
        catch (error) {
            status = activeTask.cancelled ? 'cancelled' : setupComplete ? 'error' : 'bootstrap_failed';
            errorMessage = this.errorMessage(error);
        }
        if (status === 'cancelled') {
            try {
                changedFiles = await listChangedFiles(targetDir);
                await commitAll(targetDir, `squad(${task.id}): WIP (cancelled by user)`);
            }
            catch (error) {
                errorMessage = `${errorMessage === undefined ? '' : `${errorMessage} `}Could not commit cancelled WIP: ${this.errorMessage(error)}`;
            }
        }
        const result = {
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
    async copyConfiguredFiles(worktreePath) {
        const { configDirectory } = this.options.config;
        const { copyFiles } = resolveSquadPaths(this.options.config);
        for (const sourcePath of copyFiles) {
            const relativePath = relative(configDirectory, sourcePath);
            if (relativePath.length === 0 ||
                relativePath === '..' ||
                relativePath.startsWith('..\\') ||
                relativePath.startsWith('../') ||
                isAbsolute(relativePath)) {
                throw new Error(`copyFiles entry must stay inside the config directory: ${sourcePath}`);
            }
            const destinationPath = resolve(worktreePath, relativePath);
            await mkdir(dirname(destinationPath), { recursive: true });
            await copyFile(sourcePath, destinationPath);
        }
    }
    async runBootstrap(runId, taskId, cwd, logPath, logChunks, activeTask) {
        for (const command of this.options.config.config.bootstrap) {
            if (activeTask.cancelled) {
                return;
            }
            const result = await this.runProcess(runId, taskId, logPath, logChunks, activeTask, command, [], cwd, undefined, true);
            if (activeTask.cancelled) {
                return;
            }
            if (result.timedOut || result.exitCode !== 0) {
                throw new Error(result.timedOut
                    ? `Bootstrap command timed out after ${this.options.config.config.timeoutMinutes} minutes.`
                    : this.processFailureMessage(result));
            }
        }
    }
    runProcess(runId, taskId, logPath, logChunks, activeTask, executable, args, cwd, env, shell = false, recordAgentPid = false) {
        return this.spawnProcess(executable, args, cwd, env, shell, activeTask, (chunk) => {
            const text = chunk.toString();
            logChunks.push(text);
            try {
                appendFileSync(logPath, text, 'utf8');
                const event = { type: 'task:log', runId, taskId, chunk: text };
                this.options.store.appendEvent(event);
                this.emit('task:log', event);
            }
            catch (error) {
                activeTask.logWriteError = error instanceof Error ? error : new Error(String(error));
                activeTask.child?.kill();
            }
        }, recordAgentPid
            ? (pid) => {
                this.options.store.setTaskPid(runId, taskId, pid);
            }
            : undefined, recordAgentPid
            ? () => {
                this.options.store.setTaskPid(runId, taskId, null);
            }
            : undefined);
    }
    /** Shared process lifecycle for planner and task execution; callers decide persistence. */
    spawnProcess(executable, args, cwd, env, shell, activeTask, onChunk, onSpawn, onClose) {
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
                }
                catch (error) {
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
            const reportChunk = (chunk) => {
                try {
                    onChunk?.(chunk);
                }
                catch (error) {
                    if (activeTask !== undefined) {
                        activeTask.logWriteError = error instanceof Error ? error : new Error(String(error));
                    }
                    child.kill();
                }
            };
            child.stdout?.on('data', reportChunk);
            child.stderr?.on('data', reportChunk);
            const settle = (exitCode, signal) => {
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
    finalizeTask(runId, result, activeTask) {
        if (activeTask.finalized) {
            return result;
        }
        activeTask.finalized = true;
        this.activeTasks.delete(result.id);
        const event = { type: 'task:done', runId, result };
        this.options.store.recordTaskResult(runId, result, event);
        this.emit('task:done', event);
        return result;
    }
    persistTaskResult(runId, result) {
        const event = { type: 'task:done', runId, result };
        this.options.store.recordTaskResult(runId, result, event);
        this.emit('task:done', event);
    }
    createTerminalResult(task, status, error) {
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
    async runQAReviewLoop(runId, repoPath, goal, results, logPaths, worktreeRoot) {
        const { config, store } = this.options;
        const maxRounds = config.config.maxReviewRounds ?? 2;
        if (maxRounds <= 0) {
            return;
        }
        const paths = resolveSquadPaths(config);
        for (let round = 1; round <= maxRounds; round++) {
            this.emit('review:start', { type: 'review:start', runId, round });
            let verifySummary = 'No verify command configured.';
            let verifyPassed = true;
            const verifyCommands = config.config.verify;
            if (verifyCommands.length > 0) {
                try {
                    const verifyOutputChunks = [];
                    const activeTask = { cancelled: false, finalized: false };
                    const verifyLogPath = resolve(paths.logDir, runId, `review-${round}-verify.log`);
                    const verifyResult = await this.spawnProcess(verifyCommands.join(' && '), [], repoPath, undefined, true, activeTask, (chunk) => {
                        const text = chunk.toString();
                        verifyOutputChunks.push(text);
                        try {
                            appendFileSync(verifyLogPath, text, 'utf8');
                        }
                        catch { }
                        this.emit('review:log', { type: 'review:log', runId, round, chunk: text });
                    });
                    verifyPassed = verifyResult.exitCode === 0 && !verifyResult.timedOut;
                    verifySummary = `Verify (${verifyCommands.join(' && ')}): ${verifyPassed ? 'PASSED' : 'FAILED'}\nOutput:\n${verifyOutputChunks.join('').slice(-2000)}`;
                }
                catch (err) {
                    verifyPassed = false;
                    verifySummary = `Verify error: ${this.errorMessage(err)}`;
                }
            }
            let gitSummary = '';
            try {
                const { stdout: statusOut } = await runGit(repoPath, ['status', '--short']);
                gitSummary = `Git status:\n${statusOut.slice(0, 1500)}`;
            }
            catch {
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
            const qaOutputChunks = [];
            const qaActiveTask = { cancelled: false, finalized: false };
            const qaLogPath = resolve(paths.logDir, runId, `review-${round}.log`);
            try {
                await this.spawnProcess(command[0], command.slice(1), repoPath, reviewerAgent.spec.env, false, qaActiveTask, (chunk) => {
                    const text = chunk.toString();
                    qaOutputChunks.push(text);
                    try {
                        appendFileSync(qaLogPath, text, 'utf8');
                    }
                    catch { }
                    this.emit('review:log', { type: 'review:log', runId, round, chunk: text });
                });
            }
            catch {
                // Fallback if reviewer process fails
            }
            const qaOutputText = qaOutputChunks.join('');
            let parsedReview = { status: 'passed', summary: 'QA review passed.' };
            try {
                const jsonStr = extractJson(qaOutputText);
                const parsed = JSON.parse(jsonStr);
                if (parsed.status === 'needs_fix' && Array.isArray(parsed.fixTasks) && parsed.fixTasks.length > 0) {
                    parsedReview = {
                        status: 'needs_fix',
                        summary: parsed.summary || 'QA phát hiện các điểm cần khắc phục.',
                        fixTasks: parsed.fixTasks.map((t, idx) => ({
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
                }
                else {
                    parsedReview = {
                        status: 'passed',
                        summary: parsed.summary || (verifyPassed ? 'Tất cả yêu cầu đã được đáp ứng và kiểm thử thành công.' : 'QA hoàn tất đánh giá.'),
                    };
                }
            }
            catch {
                parsedReview = {
                    status: verifyPassed ? 'passed' : 'needs_fix',
                    summary: qaOutputText.slice(0, 300) || 'QA review hoàn thành.',
                };
            }
            this.emit('review:done', { type: 'review:done', runId, round, result: parsedReview });
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
    processFailureMessage(result) {
        return result.signal === null
            ? `Process exited with code ${result.exitCode ?? 'unknown'}.`
            : `Process exited after signal ${result.signal}.`;
    }
    errorMessage(error) {
        return error instanceof Error ? error.message : String(error);
    }
}
function isProcessAlive(pid) {
    if (pid === null || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error instanceof Error && 'code' in error && error.code === 'EPERM';
    }
}
//# sourceMappingURL=runner.js.map