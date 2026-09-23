import type { Plan, RunStatus, SquadEvent, Task, TaskResult } from './types.js';
type PersistedSquadEvent = Exclude<SquadEvent, {
    type: `plan:${string}`;
}>;
export interface RunRecord {
    id: string;
    repoPath: string;
    goal: string;
    plan: Plan | null;
    pid: number | null;
    status: RunStatus;
    createdAt: string;
    endedAt: string | null;
}
export interface TaskRecord {
    id: string;
    runId: string;
    title: string;
    role: string;
    status: string;
    branch: string;
    logPath: string;
    startedAt: string | null;
    endedAt: string | null;
    error: string | null;
    pid: number | null;
}
export interface StoredEvent {
    id: number;
    runId: string;
    taskId: string | null;
    type: SquadEvent['type'];
    payload: SquadEvent;
    createdAt: string;
}
/** SQLite-backed source of truth for runs, tasks, and replayable events. */
export declare class SquadStore {
    private readonly database;
    private constructor();
    /** Opens a database, creating its parent directory when a file path is used. */
    static open(dbFile: string): Promise<SquadStore>;
    close(): void;
    createPlannedRun(id: string, repoPath: string, plan: Plan, createdAt?: string): void;
    startPlannedRun(id: string, plan: Plan, logPaths: ReadonlyMap<string, string>, event: Extract<SquadEvent, {
        type: 'run:start';
    }>, pid?: number, startedAt?: string): void;
    updateRunStatus(id: string, status: string, endedAt?: string): void;
    createTask(runId: string, task: Task, logPath: string): void;
    markTaskRunning(runId: string, taskId: string, startedAt: string): void;
    setTaskPid(runId: string, taskId: string, pid: number | null): void;
    recordTaskStarted(runId: string, taskId: string, startedAt: string, event: Extract<SquadEvent, {
        type: 'task:start';
    }>): void;
    saveTaskResult(runId: string, result: TaskResult): void;
    recordTaskResult(runId: string, result: TaskResult, event: Extract<SquadEvent, {
        type: 'task:done';
    }>, createdAt?: string): void;
    appendEvent(event: PersistedSquadEvent, createdAt?: string): void;
    completeRun(runId: string, status: string, results: TaskResult[], endedAt?: string): void;
    getRun(id: string): RunRecord | undefined;
    getRunPlan(id: string): Plan | undefined;
    listTasks(runId: string): TaskRecord[];
    getTask(runId: string, taskId: string): TaskRecord | undefined;
    /** Lists newest runs first for the CLI history view. */
    listRuns(limit: number): RunRecord[];
    listRunningRuns(): RunRecord[];
    /** Marks only unfinished work as interrupted after its coordinator process has disappeared. */
    interruptRun(runId: string, endedAt?: string): boolean;
    /** Lists task records from every run without modifying historical state. */
    listAllTasks(): TaskRecord[];
    listEvents(runId: string): StoredEvent[];
    /** Queries only events with an id strictly greater than afterId for robust replay-to-live SSE handoff. */
    listEventsAfter(runId: string, afterId: number): StoredEvent[];
    private toRunRecord;
    private toTaskRecord;
    private toStoredEvent;
    private transaction;
    private ensurePlanColumn;
    private ensurePidColumns;
    private ensureColumn;
}
export {};
//# sourceMappingURL=store.d.ts.map