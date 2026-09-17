import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
export const CLI_PRESETS = {
    claude: [
        'claude',
        '-p',
        '{{prompt}}',
        '--permission-mode',
        'acceptEdits',
        '--model',
        '{{model}}',
    ],
    codex: [
        'codex',
        'exec',
        '--sandbox',
        'workspace-write',
        '--model',
        '{{model}}',
        '{{prompt}}',
    ],
    gemini: ['gemini', '--yolo', '--model', '{{model}}', '-p', '{{prompt}}'],
};
export const AgentSpecSchema = z
    .object({
    cli: z.string().optional(),
    model: z.string().optional(),
    command: z.array(z.string()).min(1).optional(),
    env: z.record(z.string()).optional(),
    promptFile: z.string().optional(),
})
    .refine((spec) => spec.cli !== undefined || spec.command !== undefined, {
    message: 'Agent phải khai báo "cli" hoặc "command".',
});
export const SquadConfigSchema = z
    .object({
    configVersion: z.literal(1).default(1),
    baseBranch: z.string().default('main'),
    integrationBranch: z.string().default('squad/integration'),
    worktreeDir: z.string().default('.squad/worktrees'),
    dbFile: z.string().default('.squad/squad.db'),
    planFile: z.string().default('.squad/plan.json'),
    logDir: z.string().default('.squad/logs'),
    maxParallel: z.number().int().min(1).max(10).default(3),
    timeoutMinutes: z.number().int().min(1).default(30),
    bootstrap: z.array(z.string()).default([]),
    copyFiles: z.array(z.string()).default([]),
    verify: z.array(z.string()).default([]),
    agents: z.record(AgentSpecSchema),
})
    .refine((config) => 'default' in config.agents, {
    message: 'agents phải có role "default" làm fallback.',
    path: ['agents'],
});
export class ConfigError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.name = 'ConfigError';
        this.code = code;
    }
}
/** Validates an already-parsed squad configuration and applies schema defaults. */
export function parseSquadConfig(value) {
    const result = SquadConfigSchema.safeParse(value);
    if (result.success) {
        return result.data;
    }
    const issues = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; ');
    throw new ConfigError('CONFIG_INVALID', `Invalid squad.config.json: ${issues}`, {
        cause: result.error,
    });
}
/** Loads configuration and keeps its directory for deterministic relative-path resolution. */
export async function loadSquadConfig(configPath) {
    const absolutePath = resolve(configPath);
    let parsed;
    try {
        parsed = JSON.parse(await readFile(absolutePath, 'utf8'));
    }
    catch (error) {
        throw new ConfigError('CONFIG_PARSE_ERROR', `Could not read or parse squad config at ${absolutePath}.`, { cause: error });
    }
    return {
        config: parseSquadConfig(parsed),
        configPath: absolutePath,
        configDirectory: dirname(absolutePath),
    };
}
/** Resolves all runtime paths relative to the directory containing squad.config.json. */
export function resolveSquadPaths(loadedConfig) {
    const { config, configDirectory } = loadedConfig;
    return {
        worktreeDir: resolve(configDirectory, config.worktreeDir),
        dbFile: resolve(configDirectory, config.dbFile),
        planFile: resolve(configDirectory, config.planFile),
        logDir: resolve(configDirectory, config.logDir),
        copyFiles: config.copyFiles.map((filePath) => resolve(configDirectory, filePath)),
    };
}
/** Resolves routing with the default role fallback and loads its optional persona file. */
export async function resolveAgent(loadedConfig, role) {
    const spec = loadedConfig.config.agents[role] ?? loadedConfig.config.agents.default;
    const promptFile = spec.promptFile ?? `roles/${role}.md`;
    const promptPath = resolve(loadedConfig.configDirectory, promptFile);
    let persona;
    try {
        persona = await readFile(promptPath, 'utf8');
    }
    catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
            throw error;
        }
    }
    return { role, spec, persona };
}
/** Prepends a role persona to a task prompt only when a persona file exists. */
export function renderAgentPrompt(agent, taskPrompt) {
    if (agent.persona === undefined || agent.persona.trim().length === 0) {
        return taskPrompt;
    }
    return `${agent.persona.trim()}\n\n${taskPrompt}`;
}
/** Renders a preset or custom argv template without invoking a shell. */
export function renderAgentCommand(agent, prompt) {
    const { command, cli, model } = agent.spec;
    const template = command ?? (cli === undefined ? undefined : CLI_PRESETS[cli]);
    if (template === undefined) {
        throw new ConfigError('CLI_PRESET_UNKNOWN', `No CLI preset exists for agent role "${agent.role}". Set agents.${agent.role}.command instead.`);
    }
    const rendered = [];
    for (const argument of template) {
        if (argument === '{{model}}' && model === undefined) {
            if (rendered.at(-1) === '--model') {
                rendered.pop();
            }
            continue;
        }
        rendered.push(argument.replaceAll('{{prompt}}', prompt).replaceAll('{{model}}', model ?? ''));
    }
    return rendered;
}
//# sourceMappingURL=config.js.map