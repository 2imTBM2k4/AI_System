import { type ClarificationResult, type FileConflict, type MergeReport, type Plan, type RunRecord, type SquadEvent, type TaskRecord } from '@squad/core';
import { RepoRegistry } from './registry.js';
export declare class RunsManagerError extends Error {
    readonly code: 'REPO_NOT_FOUND' | 'RUN_NOT_FOUND' | 'TASK_NOT_FOUND' | 'RUN_ALREADY_ACTIVE' | 'RUN_NOT_ACTIVE' | 'TASK_NOT_CANCELLABLE' | 'RUN_STILL_ACTIVE' | 'PLAN_INVALID';
    constructor(code: RunsManagerError['code'], message: string);
}
export interface StartRunResult {
    run: RunRecord;
    created: boolean;
}
export interface RunDetail {
    run: RunRecord;
    tasks: TaskRecord[];
}
export interface SseSubscriber {
    sendEvent: (event: SquadEvent, id?: number) => void;
    close: () => void;
}
/** Coordinates in-memory active runs, SQLite persistence, and repository boundaries. */
export declare class RunsManager {
    private readonly registry;
    private readonly activeRunsByRepoId;
    private readonly activeRunsById;
    private readonly startingRunsByRepoId;
    constructor(registry: RepoRegistry);
    /** Gracefully cleans up all open stores and active runs when the server stops. */
    close(): Promise<void>;
    /** Evaluates whether the goal needs clarification (Step 0) before PM planning. */
    clarifyGoal(repoId: string, goal: string): Promise<ClarificationResult>;
    /** Lists the newest runs for a repository directly from its SQLite store. */
    listRuns(repoId: string, limit?: number): Promise<RunRecord[]>;
    /** Invokes the planner agent on a repository and creates a planned run row. */
    makePlan(repoId: string, goal: string): Promise<{
        runId: string;
        plan: Plan;
        warnings: FileConflict[];
    }>;
    /** Handles chat message: answers questions directly or plans multi-agent tasks. */
    handleChat(repoId: string, message: string, mode?: 'auto' | 'ask' | 'plan'): Promise<{
        type: 'answer';
        reply: string;
    } | {
        type: 'plan';
        runId: string;
        plan: Plan;
        warnings: FileConflict[];
    }>;
    /**
     * Starts a background run for a repository.
     * Concurrency-safe: rejects overlapping runs on the same repository, but remains
     * idempotent if the exact same run is requested again concurrently.
     */
    startRun(repoId: string, input: {
        runId?: string;
        plan?: Plan;
        force?: boolean;
    }): Promise<StartRunResult>;
    private doStartRun;
    /** Retrieves the status and task list for any historical or running run. */
    getRunDetail(runId: string): Promise<RunDetail>;
    /** Requests task cancellation on an active orchestrator. */
    cancelTask(runId: string, taskId: string): void;
    /** Retries a failed or skipped task on a run. */
    retryTask(runId: string, taskId: string): Promise<{
        runId: string;
        taskId: string;
    }>;
    /** Executes mergeRun on a finished run, integrating passed task branches. */
    mergeRun(runId: string): Promise<MergeReport>;
    /**
     * Subscribes to real-time events for a run.
     * Attaches listener FIRST, then queries SQLite with listEventsAfter using monotonic lastEventId.
     * Guarantees zero dropped events and zero duplicate events across the replay-to-live handoff.
     */
    subscribeEvents(runId: string, subscriber: SseSubscriber, fromEventId?: number): Promise<() => void>;
    private requireRepo;
    private withStore;
}
//# sourceMappingURL=runs-manager.d.ts.map