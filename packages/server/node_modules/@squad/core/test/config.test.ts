import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  loadSquadConfig,
  renderAgentCommand,
  renderAgentPrompt,
  resolveAgent,
  resolveSquadPaths,
} from '../src/config.js';

const fixturesDirectory = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fixturePath = (relativePath: string) => resolve(fixturesDirectory, relativePath);

describe('squad configuration validation', () => {
  it('loads default-only agents and applies every other schema default', async () => {
    const { config } = await loadSquadConfig(fixturePath('defaults.json'));
    expect(config).toMatchObject({
      baseBranch: 'main',
      maxParallel: 3,
      timeoutMinutes: 30,
      bootstrap: [],
      copyFiles: [],
      verify: [],
    });
  });

  it('rejects a configuration without agents.default with a readable message', async () => {
    await expect(loadSquadConfig(fixturePath('missing-default.json'))).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      message: expect.stringContaining('agents phải có role "default"'),
    });
  });

  it('rejects an agent that declares neither cli nor command', async () => {
    await expect(loadSquadConfig(fixturePath('invalid-agent.json'))).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      message: expect.stringContaining('Agent phải khai báo "cli" hoặc "command"'),
    });
  });

  it('wraps invalid JSON in ConfigError instead of exposing a raw SyntaxError', async () => {
    await expect(loadSquadConfig(fixturePath('invalid-json.json'))).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ConfigError &&
        error.code === 'CONFIG_PARSE_ERROR' &&
        error.message.includes('Could not read or parse squad config'),
    );
  });
});

describe('resolveAgent', () => {
  it('falls back to agents.default when the requested role is not configured', async () => {
    const loaded = await loadSquadConfig(fixturePath('defaults.json'));
    const agent = await resolveAgent(loaded, 'backend');
    expect(agent.spec).toBe(loaded.config.agents.default);
  });

  it('loads roles/<role>.md and prepends it to the task prompt', async () => {
    const loaded = await loadSquadConfig(fixturePath('persona/squad.config.json'));
    const agent = await resolveAgent(loaded, 'tester');
    expect(renderAgentPrompt(agent, 'Run the checkout tests.')).toBe(
      'Run focused regression tests. Report failures with reproducible steps.\n\nRun the checkout tests.',
    );
  });

  it('keeps the prompt unchanged when the conventional persona file does not exist', async () => {
    const loaded = await loadSquadConfig(fixturePath('defaults.json'));
    const agent = await resolveAgent(loaded, 'backend');
    expect(agent.persona).toBeUndefined();
    expect(renderAgentPrompt(agent, 'Implement the endpoint.')).toBe('Implement the endpoint.');
  });

  it('uses promptFile instead of the conventional roles/<role>.md file', async () => {
    const loaded = await loadSquadConfig(fixturePath('prompt-override/squad.config.json'));
    const agent = await resolveAgent(loaded, 'tester');
    expect(agent.persona?.trim()).toBe('Use the dedicated quality checklist.');
  });
});

describe('renderAgentCommand', () => {
  it('renders --model with its value when a preset agent provides a model', () => {
    expect(
      renderAgentCommand(
        { role: 'frontend', spec: { cli: 'codex', model: 'gpt-5-codex' } },
        'Implement the component.',
      ),
    ).toEqual([
      'codex',
      'exec',
      '--sandbox',
      'workspace-write',
      '--model',
      'gpt-5-codex',
      'Implement the component.',
    ]);
  });

  it('removes the complete preset --model pair when no model is configured', () => {
    expect(
      renderAgentCommand({ role: 'frontend', spec: { cli: 'codex' } }, 'Implement the component.'),
    ).toEqual(['codex', 'exec', '--sandbox', 'workspace-write', 'Implement the component.']);
  });

  it('renders a custom command literally without applying preset-specific model removal', () => {
    expect(
      renderAgentCommand(
        {
          role: 'custom',
          spec: { command: ['custom-agent', '--model', 'fixed-profile', '{{prompt}}'] },
        },
        'Inspect the migration.',
      ),
    ).toEqual(['custom-agent', '--model', 'fixed-profile', 'Inspect the migration.']);
  });
});

describe('relative config paths', () => {
  it('resolves every configured path from the config directory, not process.cwd()', async () => {
    const configPath = fixturePath('paths/squad.config.json');
    const loaded = await loadSquadConfig(configPath);
    const paths = resolveSquadPaths(loaded);
    const configDirectory = dirname(configPath);

    expect(paths).toEqual({
      worktreeDir: resolve(configDirectory, 'runtime/worktrees'),
      dbFile: resolve(configDirectory, 'runtime/squad.db'),
      planFile: resolve(configDirectory, 'plans/latest.json'),
      logDir: resolve(configDirectory, 'runtime/logs'),
      copyFiles: [resolve(configDirectory, '.env'), resolve(configDirectory, 'config/local.json')],
    });
  });
});
