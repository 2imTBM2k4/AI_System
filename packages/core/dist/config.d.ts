import { z } from 'zod';
export declare const CLI_PRESETS: Record<string, string[]>;
export declare const AgentSpecSchema: z.ZodEffects<z.ZodObject<{
    cli: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    command: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    promptFile: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    cli?: string | undefined;
    model?: string | undefined;
    command?: string[] | undefined;
    env?: Record<string, string> | undefined;
    promptFile?: string | undefined;
}, {
    cli?: string | undefined;
    model?: string | undefined;
    command?: string[] | undefined;
    env?: Record<string, string> | undefined;
    promptFile?: string | undefined;
}>, {
    cli?: string | undefined;
    model?: string | undefined;
    command?: string[] | undefined;
    env?: Record<string, string> | undefined;
    promptFile?: string | undefined;
}, {
    cli?: string | undefined;
    model?: string | undefined;
    command?: string[] | undefined;
    env?: Record<string, string> | undefined;
    promptFile?: string | undefined;
}>;
export declare const SquadConfigSchema: z.ZodEffects<z.ZodObject<{
    configVersion: z.ZodDefault<z.ZodLiteral<1>>;
    baseBranch: z.ZodDefault<z.ZodString>;
    integrationBranch: z.ZodDefault<z.ZodString>;
    worktreeDir: z.ZodDefault<z.ZodString>;
    dbFile: z.ZodDefault<z.ZodString>;
    planFile: z.ZodDefault<z.ZodString>;
    logDir: z.ZodDefault<z.ZodString>;
    maxParallel: z.ZodDefault<z.ZodNumber>;
    timeoutMinutes: z.ZodDefault<z.ZodNumber>;
    bootstrap: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    copyFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    verify: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    agents: z.ZodRecord<z.ZodString, z.ZodEffects<z.ZodObject<{
        cli: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        command: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        promptFile: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
    }, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
    }>, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
    }, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    configVersion: 1;
    baseBranch: string;
    integrationBranch: string;
    worktreeDir: string;
    dbFile: string;
    planFile: string;
    logDir: string;
    maxParallel: number;
    timeoutMinutes: number;
    bootstrap: string[];
    copyFiles: string[];
    verify: string[];
    agents: Record<string, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
    }>;
}, {
    agents: Record<string, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
    }>;
    configVersion?: 1 | undefined;
    baseBranch?: string | undefined;
    integrationBranch?: string | undefined;
    worktreeDir?: string | undefined;
    dbFile?: string | undefined;
    planFile?: string | undefined;
    logDir?: string | undefined;
    maxParallel?: number | undefined;
    timeoutMinutes?: number | undefined;
    bootstrap?: string[] | undefined;
    copyFiles?: string[] | undefined;
    verify?: string[] | undefined;
}>, {
    configVersion: 1;
    baseBranch: string;
    integrationBranch: string;
    worktreeDir: string;
    dbFile: string;
    planFile: string;
    logDir: string;
    maxParallel: number;
    timeoutMinutes: number;
    bootstrap: string[];
    copyFiles: string[];
    verify: string[];
    agents: Record<string, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
    }>;
}, {
    agents: Record<string, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
    }>;
    configVersion?: 1 | undefined;
    baseBranch?: string | undefined;
    integrationBranch?: string | undefined;
    worktreeDir?: string | undefined;
    dbFile?: string | undefined;
    planFile?: string | undefined;
    logDir?: string | undefined;
    maxParallel?: number | undefined;
    timeoutMinutes?: number | undefined;
    bootstrap?: string[] | undefined;
    copyFiles?: string[] | undefined;
    verify?: string[] | undefined;
}>;
export type AgentSpec = z.infer<typeof AgentSpecSchema>;
export type SquadConfig = z.infer<typeof SquadConfigSchema>;
export interface LoadedSquadConfig {
    config: SquadConfig;
    configPath: string;
    configDirectory: string;
}
export interface ResolvedSquadPaths {
    worktreeDir: string;
    dbFile: string;
    planFile: string;
    logDir: string;
    copyFiles: string[];
}
export interface ResolvedAgent {
    role: string;
    spec: AgentSpec;
    persona?: string;
}
export declare class ConfigError extends Error {
    readonly code: 'CONFIG_PARSE_ERROR' | 'CONFIG_INVALID' | 'CLI_PRESET_UNKNOWN';
    constructor(code: ConfigError['code'], message: string, options?: ErrorOptions);
}
/** Validates an already-parsed squad configuration and applies schema defaults. */
export declare function parseSquadConfig(value: unknown): SquadConfig;
/** Loads configuration and keeps its directory for deterministic relative-path resolution. */
export declare function loadSquadConfig(configPath: string): Promise<LoadedSquadConfig>;
/** Resolves all runtime paths relative to the directory containing squad.config.json. */
export declare function resolveSquadPaths(loadedConfig: LoadedSquadConfig): ResolvedSquadPaths;
/** Resolves routing with the default role fallback and loads its optional persona file. */
export declare function resolveAgent(loadedConfig: LoadedSquadConfig, role: string): Promise<ResolvedAgent>;
/** Prepends a role persona to a task prompt only when a persona file exists. */
export declare function renderAgentPrompt(agent: ResolvedAgent, taskPrompt: string): string;
/** Renders a preset or custom argv template without invoking a shell. */
export declare function renderAgentCommand(agent: ResolvedAgent, prompt: string): string[];
//# sourceMappingURL=config.d.ts.map