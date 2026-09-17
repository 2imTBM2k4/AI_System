import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSquadConfig, type LoadedSquadConfig } from '../src/config.js';
import { mergeRun } from '../src/merge.js';
import { SquadStore } from '../src/store.js';
import type { Plan, Task, TaskResult, TaskStatus } from '../src/types.js';

const execFileAsync = promisify(execFile);

let repoPath = '';

beforeEach(async () => {
  repoPath = await mkdtemp(join(tmpdir(), 'squad-merge-'));
  await git('init', '--initial-branch=main');
  await git('config', 'user.email', 'squad-test@example.com');
  await git('config', 'user.name', 'Squad Test');
  await writeFile(join(repoPath, 'base.txt'), 'base\n');
  await writeFile(join(repoPath, 'shared.txt'), 'base\n');
  await git('add', '.');
  await git('commit', '-m', 'base');
});

afterEach(async () => {
  await rm(repoPath, { recursive: true, force: true });
});

const git = async (...args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync('git', args, { cwd: repoPath, encoding: 'utf8' });
  return stdout;
};

const gitExitCode = async (...args: string[]): Promise<number> => {
  try {
    await execFileAsync('git', args, { cwd: repoPath, encoding: 'utf8' });
    return 0;
  } catch (error) {
    return typeof (error as { code?: unknown }).code === 'number'
      ? ((error as { code: number }).code ?? -1)
      : -1;
  }
};

const task = (id: string, branch: string, dependsOn: string[] = []): Task => ({
  id,
  title: id,
  role: 'backend',
  files: [],
  dependsOn,
  prompt: `Implement ${id}.`,
  branch,
});

const addBranch = async (branch: string, files: Record<string, string>): Promise<string> => {
  await git('checkout', '-b', branch, 'main');
  for (const [filePath, contents] of Object.entries(files)) {
    await writeFile(join(repoPath, filePath), contents);
  }
  await git('add', '.');
  await git('commit', '-m', `change ${branch}`);
  const commit = (await git('rev-parse', 'HEAD')).trim();
  await git('checkout', 'main');
  return commit;
};

const loadedConfig = (verify: string[] = []): LoadedSquadConfig => ({
  config: parseSquadConfig({
    baseBranch: 'main',
    integrationBranch: 'squad/integration',
    verify,
    agents: { default: { command: ['node', '-e', 'process.exit(0)'] } },
  }),
  configPath: join(repoPath, 'squad.config.json'),
  configDirectory: repoPath,
});

const resultFor = (entry: Task, status: TaskStatus): TaskResult => ({
  ...entry,
  status,
  log: '',
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T00:01:00.000Z',
});

const persistRun = async (
  plan: Plan,
  statuses: Record<string, TaskStatus>,
): Promise<{ store: SquadStore; runId: string }> => {
  const store = await SquadStore.open(':memory:');
  const runId = 'run-1';
  store.createPlannedRun(runId, repoPath, plan);
  store.startPlannedRun(
    runId,
    plan,
    new Map(plan.tasks.map((entry) => [entry.id, join(repoPath, `${entry.id}.log`)])),
    { type: 'run:start', runId, plan },
  );
  for (const entry of plan.tasks) {
    store.saveTaskResult(runId, resultFor(entry, statuses[entry.id]));
  }
  return { store, runId };
};

describe('mergeRun with real Git repositories', () => {
  it('merges only passed tasks and records every other status in notMerged', async () => {
    const passed = task('passed', 'squad/passed');
    const failed = task('failed', 'squad/failed');
    const interrupted = task('interrupted', 'squad/interrupted');
    await addBranch(passed.branch, { 'passed.txt': 'passed\n' });
    const { store, runId } = await persistRun(
      { goal: 'merge', tasks: [passed, failed, interrupted] },
      { passed: 'passed', failed: 'agent_failed', interrupted: 'interrupted' },
    );

    const report = await mergeRun({ runId, config: loadedConfig(), store });
    expect(report.merged).toEqual([{ id: 'passed', branch: 'squad/passed' }]);
    expect(report.notMerged).toEqual([
      { id: 'failed', branch: 'squad/failed', reason: 'agent_failed' },
      { id: 'interrupted', branch: 'squad/interrupted', reason: 'interrupted' },
    ]);
    store.close();
  });

  it('merges passed branches in topological order rather than plan array order', async () => {
    const parent = task('parent', 'squad/parent');
    const child = task('child', 'squad/child', ['parent']);
    const parentCommit = await addBranch(parent.branch, { 'parent.txt': 'parent\n' });
    const childCommit = await addBranch(child.branch, { 'child.txt': 'child\n' });
    const { store, runId } = await persistRun(
      { goal: 'order', tasks: [child, parent] },
      { parent: 'passed', child: 'passed' },
    );

    const report = await mergeRun({ runId, config: loadedConfig(), store });
    const firstParentLines = (await git('log', '--first-parent', '--format=%P', 'squad/integration'))
      .trim()
      .split(/\r?\n/);
    expect(report.merged.map((entry) => entry.id)).toEqual(['parent', 'child']);
    expect(firstParentLines[0].split(' ').at(-1)).toBe(childCommit);
    expect(firstParentLines[1].split(' ').at(-1)).toBe(parentCommit);
    store.close();
  });

  it('aborts a real conflict, reports files, and continues merging independent branches', async () => {
    const conflicting = task('conflict', 'squad/conflict');
    const good = task('good', 'squad/good');
    await addBranch(conflicting.branch, { 'shared.txt': 'branch value\n' });
    await addBranch(good.branch, { 'good.txt': 'good\n' });
    await writeFile(join(repoPath, 'shared.txt'), 'main value\n');
    await git('add', 'shared.txt');
    await git('commit', '-m', 'change main shared file');
    const { store, runId } = await persistRun(
      { goal: 'conflict', tasks: [conflicting, good] },
      { conflict: 'passed', good: 'passed' },
    );

    const report = await mergeRun({ runId, config: loadedConfig(), store });
    expect(report.conflicts).toEqual([
      { id: 'conflict', branch: 'squad/conflict', files: ['shared.txt'] },
    ]);
    expect(report.merged).toEqual([{ id: 'good', branch: 'squad/good' }]);
    expect(await git('status', '--porcelain')).toBe('');
    expect((await git('show', 'squad/integration:shared.txt')).trim()).toBe('main value');
    expect((await git('show', 'squad/integration:good.txt')).trim()).toBe('good');
    store.close();
  });

  it('resets only the failed merge commit and continues after a verify failure', async () => {
    const bad = task('bad', 'squad/bad');
    const good = task('good', 'squad/good');
    await addBranch(bad.branch, { 'fail.txt': 'fail\n' });
    await addBranch(good.branch, { 'good.txt': 'good\n' });
    const { store, runId } = await persistRun(
      { goal: 'verify', tasks: [bad, good] },
      { bad: 'passed', good: 'passed' },
    );
    const verify = ['node -e "const fs=require(\'fs\'); process.exit(fs.existsSync(\'fail.txt\') ? 1 : 0)"'];

    const report = await mergeRun({ runId, config: loadedConfig(verify), store });
    expect(report.verifyFailed).toEqual([{ id: 'bad', branch: 'squad/bad', exitCode: 1 }]);
    expect(report.merged).toEqual([{ id: 'good', branch: 'squad/good' }]);
    expect(await gitExitCode('cat-file', '-e', 'squad/integration:fail.txt')).not.toBe(0);
    expect((await git('show', 'squad/bad:fail.txt')).trim()).toBe('fail');
    expect((await git('show', 'squad/integration:good.txt')).trim()).toBe('good');
    store.close();
  });

  it('creates integration from base once and syncs it with later base commits', async () => {
    const feature = task('feature', 'squad/feature');
    await addBranch(feature.branch, { 'feature.txt': 'feature\n' });
    const { store, runId } = await persistRun(
      { goal: 'sync', tasks: [feature] },
      { feature: 'passed' },
    );

    await mergeRun({ runId, config: loadedConfig(), store });
    expect(await gitExitCode('show-ref', '--verify', '--quiet', 'refs/heads/squad/integration')).toBe(0);
    await git('checkout', 'main');
    await writeFile(join(repoPath, 'base-later.txt'), 'later\n');
    await git('add', 'base-later.txt');
    await git('commit', '-m', 'base moves forward');

    await mergeRun({ runId, config: loadedConfig(), store });
    expect(await gitExitCode('merge-base', '--is-ancestor', 'main', 'squad/integration')).toBe(0);
    store.close();
  });

  it('fails clearly when the run id is absent from SQLite', async () => {
    const store = await SquadStore.open(':memory:');
    await expect(mergeRun({ runId: 'missing', config: loadedConfig(), store })).rejects.toThrow(
      'does not have a stored plan',
    );
    store.close();
  });
});
