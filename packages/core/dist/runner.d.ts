import { EventEmitter } from 'node:events';
import { type LoadedSquadConfig } from './config.js';
import { type MergeReport } from './merge.js';
import { type FileConflict } from './planner.js';
import { SquadStore } from './store.js';
import type { Plan, TaskResult } from './types.js';
import { ClarificationStage, TechLeadStage, DevOpsStage, type ClarificationResult, type TechLeadContract, type DevOpsReport } from './stages/index.js';
export interface SquadOrchestratorOptions {
    config: LoadedSquadConfig;
    store: SquadStore;
}
export declare class RunnerError extends Error {
    readonly code: 'RUN_ALREADY_ACTIVE';
    constructor(code: RunnerError['code'], message: string);
}
/** Reconciles runs whose owning coordinator process no longer exists. */
export declare function reconcileOrphanedTasks(repoPath: string): Promise<string[]>;
/** Coordinates task worktrees and processes while persisting state before every event. */
export declare class SquadOrchestrator extends EventEmitter {
    private readonly options;
    private readonly activeTasks;
    private currentRunId?;
    readonly clarificationStage: ClarificationStage;
    readonly techLeadStage: TechLeadStage;
    readonly devOpsStage: DevOpsStage;
    constructor(options: SquadOrchestratorOptions);
    /** Step 0: Evaluates whether the user's goal needs clarification before planning. */
    clarifyGoal(goal: string): Promise<ClarificationResult>;
    /** Tech Lead: Produces architecture and API contracts. */
    produceArchitectureContract(goal: string, plan: Plan): Promise<TechLeadContract>;
    /** DevOps: Performs build verification and deployment handoff report. */
    verifyDevOps(repoPath: string): Promise<DevOpsReport>;
    makePlan(repoPath: string, goal: string): Promise<{
        runId: string;
        plan: Plan;
        warnings: FileConflict[];
    }>;
    /**
     * Intelligently handles user chat: either answers questions directly in Markdown or plans multi-agent tasks.
     */
    chat(repoPath: string, message: string, mode?: 'auto' | 'ask' | 'plan'): Promise<{
        type: 'answer';
        reply: string;
    } | {
        type: 'plan';
        runId: string;
        plan: Plan;
        warnings: FileConflict[];
    }>;
    /** Persists a hand-edited plan without invoking the planner agent. */
    createRunFromPlan(repoPath: string, plan: Plan): Promise<{
        runId: string;
    }>;
    mergeAll(runId: string): Promise<MergeReport>;
    runPlan(repoPath: string, plan: Plan, runId: string): Promise<TaskResult[]>;
    /** Requests cancellation; the close handler owns the single final state transition. */
    cancelTask(taskId: string): void;
    /** Re-executes a failed or skipped task. */
    retryTask(runId: string, repoPath: string, taskId: string): Promise<TaskResult>;
    private executeTask;
    private copyConfiguredFiles;
    private runBootstrap;
    private runProcess;
    /** Shared process lifecycle for planner and task execution; callers decide persistence. */
    private spawnProcess;
    private finalizeTask;
    private persistTaskResult;
    private createTerminalResult;
    private runQAReviewLoop;
    private processFailureMessage;
    private errorMessage;
}
//# sourceMappingURL=runner.d.ts.map