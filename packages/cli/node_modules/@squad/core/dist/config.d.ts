import { z } from 'zod';
export declare const CLI_PRESETS: Record<string, string[]>;
export declare const AgentSpecSchema: z.ZodEffects<z.ZodObject<{
    cli: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    command: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    promptFile: z.ZodOptional<z.ZodString>;
    duty: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    cli?: string | undefined;
    model?: string | undefined;
    command?: string[] | undefined;
    env?: Record<string, string> | undefined;
    promptFile?: string | undefined;
    duty?: string | undefined;
    description?: string | undefined;
}, {
    cli?: string | undefined;
    model?: string | undefined;
    command?: string[] | undefined;
    env?: Record<string, string> | undefined;
    promptFile?: string | undefined;
    duty?: string | undefined;
    description?: string | undefined;
}>, {
    cli?: string | undefined;
    model?: string | undefined;
    command?: string[] | undefined;
    env?: Record<string, string> | undefined;
    promptFile?: string | undefined;
    duty?: string | undefined;
    description?: string | undefined;
}, {
    cli?: string | undefined;
    model?: string | undefined;
    command?: string[] | undefined;
    env?: Record<string, string> | undefined;
    promptFile?: string | undefined;
    duty?: string | undefined;
    description?: string | undefined;
}>;
export declare const McpServerSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    env: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
    enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    command: string;
    env: Record<string, string>;
    args: string[];
    enabled: boolean;
    name?: string | undefined;
}, {
    command: string;
    env?: Record<string, string> | undefined;
    name?: string | undefined;
    args?: string[] | undefined;
    enabled?: boolean | undefined;
}>;
export declare const SkillConfigSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    path: z.ZodOptional<z.ZodString>;
    enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    description: string;
    name: string;
    enabled: boolean;
    path?: string | undefined;
}, {
    name: string;
    path?: string | undefined;
    description?: string | undefined;
    enabled?: boolean | undefined;
}>;
export declare const PluginConfigSchema: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    options: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    options: Record<string, unknown>;
    name: string;
    enabled: boolean;
    version: string;
}, {
    name: string;
    options?: Record<string, unknown> | undefined;
    enabled?: boolean | undefined;
    version?: string | undefined;
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
    executionMode: z.ZodDefault<z.ZodEnum<["direct", "worktree"]>>;
    maxReviewRounds: z.ZodDefault<z.ZodNumber>;
    bootstrap: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    copyFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    verify: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    agents: z.ZodRecord<z.ZodString, z.ZodEffects<z.ZodObject<{
        cli: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        command: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        promptFile: z.ZodOptional<z.ZodString>;
        duty: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
        duty?: string | undefined;
        description?: string | undefined;
    }, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
        duty?: string | undefined;
        description?: string | undefined;
    }>, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
        duty?: string | undefined;
        description?: string | undefined;
    }, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
        duty?: string | undefined;
        description?: string | undefined;
    }>>;
    mcpServers: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        command: z.ZodString;
        args: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
        env: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
        enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        command: string;
        env: Record<string, string>;
        args: string[];
        enabled: boolean;
        name?: string | undefined;
    }, {
        command: string;
        env?: Record<string, string> | undefined;
        name?: string | undefined;
        args?: string[] | undefined;
        enabled?: boolean | undefined;
    }>>>>;
    skills: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        path: z.ZodOptional<z.ZodString>;
        enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        name: string;
        enabled: boolean;
        path?: string | undefined;
    }, {
        name: string;
        path?: string | undefined;
        description?: string | undefined;
        enabled?: boolean | undefined;
    }>>>>;
    plugins: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        name: z.ZodString;
        version: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        options: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, "strip", z.ZodTypeAny, {
        options: Record<string, unknown>;
        name: string;
        enabled: boolean;
        version: string;
    }, {
        name: string;
        options?: Record<string, unknown> | undefined;
        enabled?: boolean | undefined;
        version?: string | undefined;
    }>>>>;
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
    executionMode: "direct" | "worktree";
    maxReviewRounds: number;
    bootstrap: string[];
    copyFiles: string[];
    verify: string[];
    agents: Record<string, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
        duty?: string | undefined;
        description?: string | undefined;
    }>;
    mcpServers: Record<string, {
        command: string;
        env: Record<string, string>;
        args: string[];
        enabled: boolean;
        name?: string | undefined;
    }>;
    skills: Record<string, {
        description: string;
        name: string;
        enabled: boolean;
        path?: string | undefined;
    }>;
    plugins: Record<string, {
        options: Record<string, unknown>;
        name: string;
        enabled: boolean;
        version: string;
    }>;
}, {
    agents: Record<string, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
        duty?: string | undefined;
        description?: string | undefined;
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
    executionMode?: "direct" | "worktree" | undefined;
    maxReviewRounds?: number | undefined;
    bootstrap?: string[] | undefined;
    copyFiles?: string[] | undefined;
    verify?: string[] | undefined;
    mcpServers?: Record<string, {
        command: string;
        env?: Record<string, string> | undefined;
        name?: string | undefined;
        args?: string[] | undefined;
        enabled?: boolean | undefined;
    }> | undefined;
    skills?: Record<string, {
        name: string;
        path?: string | undefined;
        description?: string | undefined;
        enabled?: boolean | undefined;
    }> | undefined;
    plugins?: Record<string, {
        name: string;
        options?: Record<string, unknown> | undefined;
        enabled?: boolean | undefined;
        version?: string | undefined;
    }> | undefined;
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
    executionMode: "direct" | "worktree";
    maxReviewRounds: number;
    bootstrap: string[];
    copyFiles: string[];
    verify: string[];
    agents: Record<string, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
        duty?: string | undefined;
        description?: string | undefined;
    }>;
    mcpServers: Record<string, {
        command: string;
        env: Record<string, string>;
        args: string[];
        enabled: boolean;
        name?: string | undefined;
    }>;
    skills: Record<string, {
        description: string;
        name: string;
        enabled: boolean;
        path?: string | undefined;
    }>;
    plugins: Record<string, {
        options: Record<string, unknown>;
        name: string;
        enabled: boolean;
        version: string;
    }>;
}, {
    agents: Record<string, {
        cli?: string | undefined;
        model?: string | undefined;
        command?: string[] | undefined;
        env?: Record<string, string> | undefined;
        promptFile?: string | undefined;
        duty?: string | undefined;
        description?: string | undefined;
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
    executionMode?: "direct" | "worktree" | undefined;
    maxReviewRounds?: number | undefined;
    bootstrap?: string[] | undefined;
    copyFiles?: string[] | undefined;
    verify?: string[] | undefined;
    mcpServers?: Record<string, {
        command: string;
        env?: Record<string, string> | undefined;
        name?: string | undefined;
        args?: string[] | undefined;
        enabled?: boolean | undefined;
    }> | undefined;
    skills?: Record<string, {
        name: string;
        path?: string | undefined;
        description?: string | undefined;
        enabled?: boolean | undefined;
    }> | undefined;
    plugins?: Record<string, {
        name: string;
        options?: Record<string, unknown> | undefined;
        enabled?: boolean | undefined;
        version?: string | undefined;
    }> | undefined;
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
    promptFile?: string;
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
/** Parses lightweight YAML frontmatter from a markdown file (e.g. cli, model, duty, description). */
export declare function parseFrontmatter(rawContent: string): {
    frontmatter: Partial<AgentSpec>;
    body: string;
};
/** Resolves candidate markdown filenames for a given role in prioritized order. */
export declare function getAgentPromptCandidates(role: string, customPromptFile?: string): string[];
/** Resolves routing with the default role fallback and loads its optional persona/agent markdown file. */
export declare function resolveAgent(loadedConfig: LoadedSquadConfig, role: string): Promise<ResolvedAgent>;
/** Prepends a role persona and duty prompt to a task prompt only when present. */
export declare function renderAgentPrompt(agent: ResolvedAgent, taskPrompt: string): string;
/** Renders a preset or custom argv template without invoking a shell. */
export declare function renderAgentCommand(agent: ResolvedAgent, prompt: string): string[];
//# sourceMappingURL=config.d.ts.map