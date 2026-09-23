import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSquadConfig, type LoadedSquadConfig } from '../src/config.js';
import { SquadOrchestrator } from '../src/runner.js';
import { SquadStore } from '../src/store.js';
import type { Plan } from '../src/types.js';
import { cleanupOrphanWorktrees } from '../src/git.js';

const execFileAsync = promisify(execFile);
let repoPath = '';
let runnerScript = '';

beforeEach(async () => {
  repoPath = await mkdtemp(join(tmpdir(), 'squad-harness-'));
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.email', 'squad-harness@example.com'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.name', 'Squad Harness Test'], { cwd: repoPath });
  await writeFile(join(repoPath, 'README.md'), '# fixture\n');
  await execFileAsync('git', ['add', '.'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-m', 'base'], { cwd: repoPath });

  runnerScript = join(repoPath, 'runner.cjs');
  await writeFile(
    runnerScript,
    "const fs=require('node:fs'); fs.writeFileSync('task-output.txt', 'ok\\n'); console.log('agent executed');\n",
  );
});

afterEach(async () => {
  if (repoPath) {
    try {
      await rm(repoPath, { recursive: true, force: true });
    } catch {}
  }
});

const createTestConfig = (executionMode: 'direct' | 'worktree' = 'worktree'): LoadedSquadConfig => {
  const parsed = parseSquadConfig({
    executionMode,
    maxParallel: 2,
    timeoutMinutes: 5,
    maxToolCalls: 20,
    permissionMode: 'restricted',
    verify: ['node -e "process.exit(0)"'],
    agents: {
      default: {
        command: ['node', runnerScript, '{{prompt}}'],
      },
      backend: {
        command: ['node', runnerScript, '{{prompt}}'],
      },
      frontend: {
        command: ['node', runnerScript, '{{prompt}}'],
      },
    },
  });

  return {
    config: parsed,
    configPath: join(repoPath, 'squad.config.json'),
    configDirectory: repoPath,
  };
};

describe('Squad Task Execution Harness (v2 Requirements)', () => {
  it('Task 1 & 9: cleans up worktrees upon task completion and emits audit events', async () => {
    const config = createTestConfig('worktree');
    const store = await SquadStore.open(join(repoPath, '.squad', 'squad.db'));
    const orchestrator = new SquadOrchestrator({ config, store });

    const emittedEvents: string[] = [];
    orchestrator.on('worktree:create', () => emittedEvents.push('worktree:create'));
    orchestrator.on('worktree:cleanup', () => emittedEvents.push('worktree:cleanup'));
    orchestrator.on('lock:acquired', () => emittedEvents.push('lock:acquired'));
    orchestrator.on('lock:released', () => emittedEvents.push('lock:released'));
    orchestrator.on('verify:gate', () => emittedEvents.push('verify:gate'));

    const plan: Plan = {
      goal: 'Worktree isolation test',
      tasks: [
        {
          id: 'task-wt-1',
          title: 'Worktree Task 1',
          role: 'default',
          files: ['packages/server/app.ts'],
          dependsOn: [],
          prompt: 'Do task 1',
          branch: 'squad/task-wt-1',
        },
      ],
    };

    store.createPlannedRun('run-wt-1', repoPath, plan);
    const results = await orchestrator.runPlan(repoPath, plan, 'run-wt-1');
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('passed');

    // Verify lifecycle events were emitted
    expect(emittedEvents).toContain('worktree:create');
    expect(emittedEvents).toContain('worktree:cleanup');
    expect(emittedEvents).toContain('lock:acquired');
    expect(emittedEvents).toContain('lock:released');
    expect(emittedEvents).toContain('verify:gate');

    // Verify store recorded audit trail
    const auditTrail = store.getRunAuditTrail('run-wt-1');
    const eventTypes = auditTrail.map((e) => e.type);
    expect(eventTypes).toContain('worktree:create');
    expect(eventTypes).toContain('worktree:cleanup');
    expect(eventTypes).toContain('lock:acquired');
    expect(eventTypes).toContain('lock:released');
    expect(eventTypes).toContain('verify:gate');

    store.close();
  });

  it('Task 3 & 5: denies unauthorized file writes through Hook layer', async () => {
    const config = createTestConfig('direct');
    const store = await SquadStore.open(join(repoPath, '.squad', 'squad.db'));
    const orchestrator = new SquadOrchestrator({ config, store });

    const plan: Plan = {
      goal: 'Security permission boundary test',
      tasks: [
        {
          id: 'task-sec-1',
          title: 'Backend attempts modifying frontend component',
          role: 'backend', // backend cannot write to apps/web/**
          files: ['apps/web/src/Header.tsx'],
          dependsOn: [],
          prompt: 'Modify header',
          branch: 'squad/task-sec-1',
        },
      ],
    };

    store.createPlannedRun('run-sec-1', repoPath, plan);
    const results = await orchestrator.runPlan(repoPath, plan, 'run-sec-1');
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('agent_failed');
    expect(results[0]?.error).toContain("outside the assigned scope for role 'backend'");

    store.close();
  });

  it('Task 7: denies modifying protected acceptance tests', async () => {
    const config = createTestConfig('direct');
    const store = await SquadStore.open(join(repoPath, '.squad', 'squad.db'));
    const orchestrator = new SquadOrchestrator({ config, store });

    const plan: Plan = {
      goal: 'Acceptance test protection test',
      tasks: [
        {
          id: 'task-acc-1',
          title: 'Dev attempts modifying acceptance test',
          role: 'backend',
          files: ['packages/server/auth.acceptance.test.ts'],
          dependsOn: [],
          prompt: 'Modify test',
          branch: 'squad/task-acc-1',
          acceptanceTests: ['packages/server/auth.acceptance.test.ts'],
        },
      ],
    };

    store.createPlannedRun('run-acc-1', repoPath, plan);
    const results = await orchestrator.runPlan(repoPath, plan, 'run-acc-1');
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('agent_failed');
    expect(results[0]?.error).toContain('forbidden from modifying protected path');

    store.close();
  });

  it('Task 1: sweeps orphan worktree directories', async () => {
    const worktreeDir = join(repoPath, '.squad', 'worktrees');
    const orphanDir = join(worktreeDir, 'dead-run', 'dead-task');
    await mkdir(orphanDir, { recursive: true });
    await writeFile(join(orphanDir, 'leftover.txt'), 'abandoned');

    // Run orphan cleanup
    await cleanupOrphanWorktrees(repoPath, worktreeDir);

    const { existsSync } = await import('node:fs');
    expect(existsSync(orphanDir)).toBe(false);
  });

  it('Task 6: maps role-specific verify commands to the target package', async () => {
    const { ROLE_DEFAULT_VERIFY_COMMANDS } = await import('../src/runner.js');
    expect(ROLE_DEFAULT_VERIFY_COMMANDS.frontend).toBe('pnpm --filter @squad/web test');
    expect(ROLE_DEFAULT_VERIFY_COMMANDS.backend).toBe('pnpm --filter @squad/server test');
    expect(ROLE_DEFAULT_VERIFY_COMMANDS.database).toBe('pnpm --filter @squad/core test');
    expect(ROLE_DEFAULT_VERIFY_COMMANDS.devops).toBe('pnpm build');
  });
});
