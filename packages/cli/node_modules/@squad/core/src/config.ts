import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const DIRECT_RUNNER = resolve(dirname(fileURLToPath(import.meta.url)), '../bin/direct-runner.mjs');

export const CLI_PRESETS: Record<string, string[]> = {
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
  '9router': [
    process.execPath,
    DIRECT_RUNNER,
    '--model',
    '{{model}}',
    '--prompt',
    '{{prompt}}',
  ],
  openrouter: [
    process.execPath,
    DIRECT_RUNNER,
    '--model',
    '{{model}}',
    '--prompt',
    '{{prompt}}',
  ],
};

export const AgentSpecSchema = z
  .object({
    cli: z.string().optional(),
    model: z.string().optional(),
    command: z.array(z.string()).min(1).optional(),
    env: z.record(z.string()).optional(),
    promptFile: z.string().optional(),
    duty: z.string().optional(),
    description: z.string().optional(),
  })
  .refine((spec) => spec.cli !== undefined || spec.command !== undefined, {
    message: 'Agent phải khai báo "cli" hoặc "command".',
  });

export const McpServerSchema = z.object({
  name: z.string().optional(),
  command: z.string(),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string()).optional().default({}),
  enabled: z.boolean().optional().default(true),
});

export const SkillConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(''),
  path: z.string().optional(),
  enabled: z.boolean().optional().default(true),
});

export const PluginConfigSchema = z.object({
  name: z.string(),
  version: z.string().optional().default('latest'),
  enabled: z.boolean().optional().default(true),
  options: z.record(z.unknown()).optional().default({}),
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
    executionMode: z.enum(['direct', 'worktree']).default('worktree'),
    maxReviewRounds: z.number().int().min(0).max(5).default(0),
    bootstrap: z.array(z.string()).default([]),
    copyFiles: z.array(z.string()).default([]),
    verify: z.array(z.string()).default([]),
    agents: z.record(AgentSpecSchema),
    mcpServers: z.record(McpServerSchema).optional().default({}),
    skills: z.record(SkillConfigSchema).optional().default({}),
    plugins: z.record(PluginConfigSchema).optional().default({}),
  })
  .refine((config) => 'default' in config.agents, {
    message: 'agents phải có role "default" làm fallback.',
    path: ['agents'],
  });

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

export class ConfigError extends Error {
  readonly code: 'CONFIG_PARSE_ERROR' | 'CONFIG_INVALID' | 'CLI_PRESET_UNKNOWN';

  constructor(
    code: ConfigError['code'],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ConfigError';
    this.code = code;
  }
}

/** Validates an already-parsed squad configuration and applies schema defaults. */
export function parseSquadConfig(value: unknown): SquadConfig {
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
export async function loadSquadConfig(configPath: string): Promise<LoadedSquadConfig> {
  const absolutePath = resolve(configPath);
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(absolutePath, 'utf8'));
  } catch (error) {
    throw new ConfigError(
      'CONFIG_PARSE_ERROR',
      `Could not read or parse squad config at ${absolutePath}.`,
      { cause: error },
    );
  }

  return {
    config: parseSquadConfig(parsed),
    configPath: absolutePath,
    configDirectory: dirname(absolutePath),
  };
}

/** Resolves all runtime paths relative to the directory containing squad.config.json. */
export function resolveSquadPaths(loadedConfig: LoadedSquadConfig): ResolvedSquadPaths {
  const { config, configDirectory } = loadedConfig;

  return {
    worktreeDir: resolve(configDirectory, config.worktreeDir),
    dbFile: resolve(configDirectory, config.dbFile),
    planFile: resolve(configDirectory, config.planFile),
    logDir: resolve(configDirectory, config.logDir),
    copyFiles: config.copyFiles.map((filePath) => resolve(configDirectory, filePath)),
  };
}

/** Parses lightweight YAML frontmatter from a markdown file (e.g. cli, model, duty, description). */
export function parseFrontmatter(rawContent: string): { frontmatter: Partial<AgentSpec>; body: string } {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: rawContent };
  }

  const yamlBlock = match[1];
  const body = match[2];
  const frontmatter: Partial<AgentSpec> = {};

  const lines = yamlBlock.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key === 'cli' && ['claude', 'codex', 'gemini', '9router'].includes(val)) {
      frontmatter.cli = val as AgentSpec['cli'];
    } else if (key === 'model') {
      frontmatter.model = val;
    } else if (key === 'duty') {
      frontmatter.duty = val;
    } else if (key === 'description') {
      frontmatter.description = val;
    }
  }

  return { frontmatter, body };
}

/** Resolves candidate markdown filenames for a given role in prioritized order. */
export function getAgentPromptCandidates(role: string, customPromptFile?: string): string[] {
  const roleAliases: Record<string, string[]> = {
    pm: ['planner'],
    planner: ['pm'],
    qa: ['tester', 'reviewer'],
    tester: ['qa', 'reviewer'],
    reviewer: ['qa', 'tester'],
    techlead: ['architect'],
  };
  const rolesToSearch = [role, ...(roleAliases[role] ?? [])];
  const standard: string[] = [];
  for (const r of rolesToSearch) {
    standard.push(
      `agent_${r}.md`,
      `agents/agent_${r}.md`,
      `agents/${r}.md`,
      `.agents/${r}.md`,
      `roles/${r}.md`,
    );
  }
  if (customPromptFile) {
    return [customPromptFile, ...standard];
  }
  return standard;
}

/** Resolves routing with the default role fallback and loads its optional persona/agent markdown file. */
export async function resolveAgent(
  loadedConfig: LoadedSquadConfig,
  role: string,
): Promise<ResolvedAgent> {
  const roleAliases: Record<string, string[]> = {
    pm: ['pm', 'planner'],
    planner: ['pm', 'planner'],
    qa: ['qa', 'tester', 'reviewer'],
    tester: ['qa', 'tester'],
    reviewer: ['qa', 'reviewer', 'tester'],
    techlead: ['techlead', 'architect'],
  };
  const candidatesToCheck = roleAliases[role] ?? [role];
  let baseSpec = loadedConfig.config.agents[role];
  if (!baseSpec) {
    for (const alt of candidatesToCheck) {
      if (loadedConfig.config.agents[alt]) {
        baseSpec = loadedConfig.config.agents[alt];
        break;
      }
    }
  }
  baseSpec = baseSpec ?? loadedConfig.config.agents.default;
  const candidates = getAgentPromptCandidates(role, baseSpec.promptFile);

  let persona: string | undefined;
  let resolvedPromptFile: string | undefined;
  let frontmatterData: Partial<AgentSpec> = {};

  for (const candidate of candidates) {
    const candidatePath = resolve(loadedConfig.configDirectory, candidate);
    try {
      const raw = await readFile(candidatePath, 'utf8');
      const parsed = parseFrontmatter(raw);
      frontmatterData = parsed.frontmatter;
      persona = parsed.body.trim().length > 0 ? parsed.body.trim() : undefined;
      resolvedPromptFile = candidate;
      break;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // Merge frontmatter with baseSpec only if frontmatter was present
  const hasFrontmatter = Object.keys(frontmatterData).length > 0;
  const spec: AgentSpec = hasFrontmatter
    ? {
        ...baseSpec,
        cli: baseSpec.cli ?? frontmatterData.cli,
        model: baseSpec.model ?? frontmatterData.model,
        duty: baseSpec.duty ?? frontmatterData.duty,
        description: baseSpec.description ?? frontmatterData.description,
      }
    : baseSpec;

  return { role, spec, persona, promptFile: resolvedPromptFile };
}

/** Prepends a role persona and duty prompt to a task prompt only when present. */
export function renderAgentPrompt(agent: ResolvedAgent, taskPrompt: string): string {
  const parts: string[] = [];
  if (agent.persona !== undefined && agent.persona.trim().length > 0) {
    parts.push(agent.persona.trim());
  } else if (agent.spec.duty && agent.spec.duty.trim().length > 0) {
    parts.push(`[ROLE DUTY & GUIDELINES]:\n${agent.spec.duty.trim()}`);
  }

  if (parts.length === 0) {
    return taskPrompt;
  }

  return `${parts.join('\n\n')}\n\n${taskPrompt}`;
}

/** Renders a preset or custom argv template without invoking a shell. */
export function renderAgentCommand(agent: ResolvedAgent, prompt: string): string[] {
  const { command, cli, model } = agent.spec;
  const template = command ?? (cli === undefined ? undefined : CLI_PRESETS[cli]);

  if (template === undefined) {
    throw new ConfigError(
      'CLI_PRESET_UNKNOWN',
      `No CLI preset exists for agent role "${agent.role}". Set agents.${agent.role}.command instead.`,
    );
  }

  const rendered: string[] = [];
  for (const argument of template) {
    if (argument === '{{model}}' && model === undefined) {
      if (rendered.at(-1) === '--model') {
        rendered.pop();
      }
      continue;
    }

    rendered.push(
      argument.replaceAll('{{prompt}}', prompt).replaceAll('{{model}}', model ?? ''),
    );
  }

  return rendered;
}
