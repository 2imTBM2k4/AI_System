export type TaskStatus = 'pending' | 'running' | 'passed' | 'verify_failed' | 'agent_failed' | 'bootstrap_failed' | 'skipped' | 'cancelled' | 'interrupted' | 'error';
export type RunStatus = 'planned' | 'running' | 'completed' | 'interrupted' | 'failed';
export interface Task {
    id: string;
    title: string;
    role: string;
    files: string[];
    dependsOn: string[];
    prompt: string;
    verify?: string;
    branch: string;
}
export interface Plan {
    goal: string;
    tasks: Task[];
}
export interface TaskResult extends Task {
    status: TaskStatus;
    agent?: string;
    changedFiles?: string[];
    log: string;
    startedAt: string;
    endedAt?: string;
    error?: string;
}
export type SquadEvent = {
    type: 'plan:start';
    goal: string;
} | {
    type: 'plan:log';
    chunk: string;
} | {
    type: 'plan:done';
    runId: string;
    plan: Plan;
    warnings: FileConflict[];
} | {
    type: 'run:start';
    runId: string;
    plan: Plan;
} | {
    type: 'task:start';
    runId: string;
    taskId: string;
} | {
    type: 'task:log';
    runId: string;
    taskId: string;
    chunk: string;
} | {
    type: 'task:done';
    runId: string;
    result: TaskResult;
} | {
    type: 'run:done';
    runId: string;
    results: TaskResult[];
};
import type { FileConflict } from './planner.js';
//# sourceMappingURL=types.d.ts.map