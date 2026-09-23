export type TaskStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'verify_failed'
  | 'agent_failed'
  | 'bootstrap_failed'
  | 'skipped'
  | 'cancelled'
  | 'interrupted'
  | 'error';

export type RunStatus =
  | 'planned'
  | 'running'
  | 'completed'
  | 'interrupted'
  | 'failed';

export interface Task {
  id: string;
  title: string;
  role: string;
  files: string[];
  dependsOn: string[];
  prompt: string;
  verify?: string;
  acceptanceTests?: string[];
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

export type ExecutionMode = 'direct' | 'worktree';

export type ReviewStatus = 'passed' | 'needs_fix';

export interface ReviewResult {
  status: ReviewStatus;
  summary: string;
  fixTasks?: Task[];
}

export type SquadEvent =
  | { type: 'plan:start'; goal: string }
  | { type: 'plan:log'; chunk: string }
  | { type: 'plan:done'; runId: string; plan: Plan; warnings: FileConflict[] }
  | { type: 'run:start'; runId: string; plan: Plan }
  | { type: 'task:start'; runId: string; taskId: string }
  | { type: 'task:log'; runId: string; taskId: string; chunk: string }
  | { type: 'task:done'; runId: string; result: TaskResult }
  | { type: 'worktree:create'; runId: string; taskId: string; worktreePath: string }
  | { type: 'worktree:cleanup'; runId: string; taskId: string; worktreePath: string }
  | { type: 'lock:acquired'; runId: string; taskId: string; pid: number }
  | { type: 'lock:released'; runId: string; taskId: string }
  | {
      type: 'hook:evaluated';
      runId: string;
      taskId: string;
      actionType: string;
      target: string;
      decision: 'allow' | 'deny';
      reason?: string;
    }
  | { type: 'verify:gate'; runId: string; taskId: string; status: 'passed' | 'failed'; error?: string }
  | { type: 'review:start'; runId: string; round: number }
  | { type: 'review:log'; runId: string; round: number; chunk: string }
  | { type: 'review:done'; runId: string; round: number; result: ReviewResult }
  | { type: 'run:done'; runId: string; results: TaskResult[] };
import type { FileConflict } from './planner.js';
