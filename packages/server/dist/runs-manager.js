import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { loadSquadConfig, mergeRun, resolveSquadPaths, SquadOrchestrator, SquadStore, validatePlan, ClarificationStage, } from '@squad/core';
export class RunsManagerError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'RunsManagerError';
        this.code = code;
    }
}
/** Coordinates in-memory active runs, SQLite persistence, and repository boundaries. */
export class RunsManager {
    registry;
    activeRunsByRepoId = new Map();
    activeRunsById = new Map();
    startingRunsByRepoId = new Map();
    constructor(registry) {
        this.registry = registry;
    }
    /** Gracefully cleans up all open stores and active runs when the server stops. */
    async close() {
        for (const context of this.activeRunsById.values()) {
            try {
                context.store.close();
            }
            catch {
                // Ignore store close errors during shutdown
            }
        }
        this.activeRunsByRepoId.clear();
        this.activeRunsById.clear();
        this.startingRunsByRepoId.clear();
    }
    /** Evaluates whether the goal needs clarification (Step 0) before PM planning. */
    async clarifyGoal(repoId, goal) {
        this.requireRepo(repoId);
        const stage = new ClarificationStage();
        return stage.evaluate(goal);
    }
    /** Lists the newest runs for a repository directly from its SQLite store. */
    async listRuns(repoId, limit = 10) {
        const repo = this.requireRepo(repoId);
        const active = this.activeRunsByRepoId.get(repoId);
        if (active !== undefined) {
            return active.store.listRuns(limit);
        }
        return this.withStore(repo.path, (store) => store.listRuns(limit));
    }
    /** Invokes the planner agent on a repository and creates a planned run row. */
    async makePlan(repoId, goal) {
        const repo = this.requireRepo(repoId);
        return this.withStore(repo.path, async (store, config) => {
            const orchestrator = new SquadOrchestrator({ config, store });
            return orchestrator.makePlan(repo.path, goal);
        });
    }
    /** Handles chat message: answers questions directly or plans multi-agent tasks. */
    async handleChat(repoId, message, mode = 'auto') {
        const repo = this.requireRepo(repoId);
        return this.withStore(repo.path, async (store, config) => {
            const orchestrator = new SquadOrchestrator({ config, store });
            return orchestrator.chat(repo.path, message, mode);
        });
    }
    /**
     * Starts a background run for a repository.
     * Concurrency-safe: rejects overlapping runs on the same repository, but remains
     * idempotent if the exact same run is requested again concurrently.
     */
    async startRun(repoId, input) {
        const repo = this.requireRepo(repoId);
        // Fast check for active run in memory
        const existingActive = this.activeRunsByRepoId.get(repoId);
        if (existingActive !== undefined) {
            if (input.runId !== undefined && existingActive.runId === input.runId) {
                const run = existingActive.store.getRun(existingActive.runId);
                if (run !== undefined) {
                    return { run, created: false };
                }
            }
            throw new RunsManagerError('RUN_ALREADY_ACTIVE', `Repository ${repoId} already has an active run.`);
        }
        // Check if another request is currently starting a run for this repo
        const starting = this.startingRunsByRepoId.get(repoId);
        if (starting !== undefined) {
            if (input.runId !== undefined && starting.runId === input.runId) {
                const res = await starting.promise;
                return { run: res.run, created: false };
            }
            throw new RunsManagerError('RUN_ALREADY_ACTIVE', `Repository ${repoId} already has a run starting.`);
        }
        let resolveStarting;
        let rejectStarting;
        const startingPromise = new Promise((res, rej) => {
            resolveStarting = res;
            rejectStarting = rej;
        });
        this.startingRunsByRepoId.set(repoId, { runId: input.runId, promise: startingPromise });
        try {
            const result = await this.doStartRun(repo, input);
            resolveStarting(result);
            return result;
        }
        catch (error) {
            rejectStarting(error);
            throw error;
        }
        finally {
            this.startingRunsByRepoId.delete(repoId);
        }
    }
    async doStartRun(repo, input) {
        const config = await loadSquadConfig(resolve(repo.path, 'squad.config.json'));
        const paths = resolveSquadPaths(config);
        const store = await SquadStore.open(paths.dbFile);
        try {
            let runId;
            let plan;
            if (input.runId !== undefined) {
                runId = input.runId;
                const storedPlan = store.getRunPlan(runId);
                if (storedPlan === undefined) {
                    throw new RunsManagerError('RUN_NOT_FOUND', `Run ${runId} was not found in planned state.`);
                }
                plan = storedPlan;
            }
            else if (input.plan !== undefined) {
                plan = validatePlan(input.plan, input.plan.goal);
                runId = randomUUID();
                store.createPlannedRun(runId, repo.path, plan);
            }
            else {
                throw new RunsManagerError('PLAN_INVALID', 'Either runId or plan must be provided.');
            }
            const orchestrator = new SquadOrchestrator({ config, store });
            const context = {
                runId,
                repoId: repo.id,
                repoPath: repo.path,
                orchestrator,
                store,
                config,
                executionPromise: Promise.resolve([]),
            };
            // Start running asynchronously in the background
            const executionPromise = orchestrator.runPlan(repo.path, plan, runId)
                .catch(() => {
                // Error is recorded in SQLite store status/tasks
                return [];
            })
                .finally(() => {
                this.activeRunsByRepoId.delete(repo.id);
                this.activeRunsById.delete(runId);
                try {
                    store.close();
                }
                catch {
                    // Ignore store close error
                }
            });
            context.executionPromise = executionPromise;
            this.activeRunsByRepoId.set(repo.id, context);
            this.activeRunsById.set(runId, context);
            const currentRun = store.getRun(runId);
            if (currentRun === undefined) {
                throw new RunsManagerError('RUN_NOT_FOUND', `Could not load run ${runId} after starting.`);
            }
            return { run: currentRun, created: true };
        }
        catch (error) {
            store.close();
            throw error;
        }
    }
    /** Retrieves the status and task list for any historical or running run. */
    async getRunDetail(runId) {
        const resolveTasks = (run, tasks) => {
            if (tasks.length === 0 && run.plan?.tasks) {
                return run.plan.tasks.map((t) => ({
                    id: t.id,
                    runId: run.id,
                    title: t.title,
                    role: t.role,
                    status: 'pending',
                    branch: t.branch,
                    logPath: '',
                    startedAt: null,
                    endedAt: null,
                    error: null,
                    pid: null,
                }));
            }
            return tasks;
        };
        const active = this.activeRunsById.get(runId);
        if (active !== undefined) {
            const run = active.store.getRun(runId);
            if (run !== undefined) {
                return { run, tasks: resolveTasks(run, active.store.listTasks(runId)) };
            }
        }
        for (const repo of this.registry.list()) {
            const detail = await this.withStore(repo.path, (store) => {
                const run = store.getRun(runId);
                if (run !== undefined) {
                    return { run, tasks: resolveTasks(run, store.listTasks(runId)) };
                }
                return undefined;
            });
            if (detail !== undefined) {
                return detail;
            }
        }
        throw new RunsManagerError('RUN_NOT_FOUND', `Run ${runId} was not found in any registered repository.`);
    }
    /** Requests task cancellation on an active orchestrator. */
    cancelTask(runId, taskId) {
        const active = this.activeRunsById.get(runId);
        if (active === undefined) {
            throw new RunsManagerError('RUN_NOT_ACTIVE', `Run ${runId} is not currently active.`);
        }
        active.orchestrator.cancelTask(taskId);
    }
    /** Retries a failed or skipped task on a run. */
    async retryTask(runId, taskId) {
        const active = this.activeRunsById.get(runId);
        if (active !== undefined) {
            const task = active.store.getTask(runId, taskId);
            if (task === undefined) {
                throw new RunsManagerError('TASK_NOT_FOUND', `Task ${taskId} was not found in run ${runId}.`);
            }
            active.orchestrator.retryTask(runId, active.repoPath, taskId).catch(() => { });
            return { runId, taskId };
        }
        // If not currently in memory, find the repository holding this run:
        for (const repo of this.registry.list()) {
            const config = await loadSquadConfig(resolve(repo.path, 'squad.config.json'));
            const paths = resolveSquadPaths(config);
            const store = await SquadStore.open(paths.dbFile);
            const run = store.getRun(runId);
            if (run === undefined) {
                store.close();
                continue;
            }
            const task = store.getTask(runId, taskId);
            if (task === undefined) {
                store.close();
                throw new RunsManagerError('TASK_NOT_FOUND', `Task ${taskId} was not found in run ${runId}.`);
            }
            const orchestrator = new SquadOrchestrator({ config, store });
            const context = {
                runId,
                repoId: repo.id,
                repoPath: repo.path,
                orchestrator,
                store,
                config,
                executionPromise: Promise.resolve([]),
            };
            this.activeRunsByRepoId.set(repo.id, context);
            this.activeRunsById.set(runId, context);
            const executionPromise = orchestrator
                .retryTask(runId, repo.path, taskId)
                .catch(() => ({}))
                .finally(() => {
                this.activeRunsByRepoId.delete(repo.id);
                this.activeRunsById.delete(runId);
                try {
                    store.close();
                }
                catch { }
            });
            context.executionPromise = executionPromise;
            return { runId, taskId };
        }
        throw new RunsManagerError('RUN_NOT_FOUND', `Run ${runId} was not found in any registered repository.`);
    }
    /** Executes mergeRun on a finished run, integrating passed task branches. */
    async mergeRun(runId) {
        const active = this.activeRunsById.get(runId);
        if (active !== undefined) {
            throw new RunsManagerError('RUN_STILL_ACTIVE', `Run ${runId} is still active. Wait for it to complete.`);
        }
        for (const repo of this.registry.list()) {
            const report = await this.withStore(repo.path, async (store, config) => {
                const run = store.getRun(runId);
                if (run === undefined) {
                    return undefined;
                }
                return mergeRun({ runId, config, store });
            });
            if (report !== undefined) {
                return report;
            }
        }
        throw new RunsManagerError('RUN_NOT_FOUND', `Run ${runId} was not found in any registered repository.`);
    }
    /**
     * Subscribes to real-time events for a run.
     * Attaches listener FIRST, then queries SQLite with listEventsAfter using monotonic lastEventId.
     * Guarantees zero dropped events and zero duplicate events across the replay-to-live handoff.
     */
    async subscribeEvents(runId, subscriber, fromEventId = 0) {
        const active = this.activeRunsById.get(runId);
        if (active !== undefined) {
            let lastEventId = fromEventId;
            const flushNewEvents = () => {
                const newEvents = active.store.listEventsAfter(runId, lastEventId);
                for (const ev of newEvents) {
                    subscriber.sendEvent(ev.payload, ev.id);
                    lastEventId = ev.id;
                }
                const latestRun = active.store.getRun(runId);
                if (latestRun !== undefined && latestRun.status !== 'running' && latestRun.status !== 'planned') {
                    subscriber.close();
                }
            };
            const eventNames = [
                'run:start',
                'task:start',
                'task:log',
                'task:done',
                'review:start',
                'review:log',
                'review:done',
                'run:done',
            ];
            // Attach live listener FIRST so no event can be missed during the initial query
            const onEvent = () => {
                flushNewEvents();
            };
            for (const name of eventNames) {
                active.orchestrator.on(name, onEvent);
            }
            // Replay all events recorded up to this point using monotonic lastEventId
            flushNewEvents();
            return () => {
                for (const name of eventNames) {
                    active.orchestrator.off(name, onEvent);
                }
            };
        }
        // Not currently active in memory: replay historical events from disk
        for (const repo of this.registry.list()) {
            const found = await this.withStore(repo.path, (store) => {
                const run = store.getRun(runId);
                if (run === undefined) {
                    return false;
                }
                const events = store.listEventsAfter(runId, fromEventId);
                for (const ev of events) {
                    subscriber.sendEvent(ev.payload, ev.id);
                }
                return true;
            });
            if (found) {
                subscriber.close();
                return () => { };
            }
        }
        throw new RunsManagerError('RUN_NOT_FOUND', `Run ${runId} was not found in any registered repository.`);
    }
    requireRepo(repoId) {
        const repo = this.registry.get(repoId);
        if (repo === undefined) {
            throw new RunsManagerError('REPO_NOT_FOUND', `Repository ${repoId} is not registered.`);
        }
        return repo;
    }
    async withStore(repoPath, fn) {
        const config = await loadSquadConfig(resolve(repoPath, 'squad.config.json'));
        const paths = resolveSquadPaths(config);
        const store = await SquadStore.open(paths.dbFile);
        try {
            return await fn(store, config);
        }
        finally {
            store.close();
        }
    }
}
//# sourceMappingURL=runs-manager.js.map