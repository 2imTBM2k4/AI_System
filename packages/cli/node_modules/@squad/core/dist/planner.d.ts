import { z } from 'zod';
import type { SquadConfig } from './config.js';
import type { Plan, Task } from './types.js';
export interface RepoOverview {
    fileCount: number;
    tree: string;
}
export interface FileConflict {
    taskA: string;
    taskB: string;
    files: string[];
}
export declare class PlanError extends Error {
    readonly code: "PLAN_INVALID";
    constructor(message: string, options?: ErrorOptions);
}
export declare const PlanTaskSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    role: z.ZodString;
    files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    prompt: z.ZodString;
    verify: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    title: string;
    role: string;
    files: string[];
    dependsOn: string[];
    prompt: string;
    verify?: string | undefined;
    branch?: string | undefined;
}, {
    id: string;
    title: string;
    role: string;
    prompt: string;
    files?: string[] | undefined;
    dependsOn?: string[] | undefined;
    verify?: string | undefined;
    branch?: string | undefined;
}>;
export declare const PlanSchema: z.ZodObject<{
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        role: z.ZodString;
        files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        prompt: z.ZodString;
        verify: z.ZodOptional<z.ZodString>;
        branch: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        title: string;
        role: string;
        files: string[];
        dependsOn: string[];
        prompt: string;
        verify?: string | undefined;
        branch?: string | undefined;
    }, {
        id: string;
        title: string;
        role: string;
        prompt: string;
        files?: string[] | undefined;
        dependsOn?: string[] | undefined;
        verify?: string | undefined;
        branch?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    tasks: {
        id: string;
        title: string;
        role: string;
        files: string[];
        dependsOn: string[];
        prompt: string;
        verify?: string | undefined;
        branch?: string | undefined;
    }[];
}, {
    tasks: {
        id: string;
        title: string;
        role: string;
        prompt: string;
        files?: string[] | undefined;
        dependsOn?: string[] | undefined;
        verify?: string | undefined;
        branch?: string | undefined;
    }[];
}>;
/** Builds the planning prompt for roadmap execution. */
export declare function buildPlannerPrompt(cfg: SquadConfig, goal: string, overview: RepoOverview): string;
/** Builds a consultation prompt for pure Q&A and code explanation without task planning. */
export declare function buildConsultationPrompt(cfg: SquadConfig, message: string, overview: RepoOverview): string;
/** Builds an intelligent prompt that lets the agent detect intent: Q&A / discussion vs actionable multi-agent task planning. */
export declare function buildSmartChatPrompt(cfg: SquadConfig, message: string, overview: RepoOverview): string;
/** Summarizes tracked files without reading repository contents. */
export declare function repoOverview(repoPath: string): Promise<RepoOverview>;
/** Extracts a balanced JSON object from agent output, filtering out reasoning tags and prioritizing objects containing "tasks". */
export declare function extractJson(text: string): string;
/** Parses, validates, and completes an agent-generated plan. */
export declare function parsePlanOutput(output: string, goal: string): Plan;
/** Tries to parse a plan from agent output, returning null if it's not a valid plan. */
export declare function tryParsePlanOutput(output: string, goal: string): Plan | null;
/** Strips reasoning tags and trims chat reply text. */
export declare function cleanChatReply(text: string): string;
/** Validates a plan document from any source and fills in deterministic branch names. */
export declare function validatePlan(value: unknown, goal: string): Plan;
/** Rejects duplicate ids, missing dependencies, and all dependency cycles. */
export declare function detectCycle(tasks: readonly Task[]): void;
/** Returns tasks in dependency order after validating the graph. */
export declare function topoSort(tasks: readonly Task[]): Task[];
/** Finds overlapping declared files between tasks with no dependency relationship. */
export declare function fileConflicts(tasks: readonly Task[]): FileConflict[];
//# sourceMappingURL=planner.d.ts.map