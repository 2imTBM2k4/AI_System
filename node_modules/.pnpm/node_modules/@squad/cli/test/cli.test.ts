import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SquadStore } from '@squad/core';
import type { Plan, Task, TaskResult, TaskStatus } from '@squad/core';

const execFileAsync = promisify(execFile);
const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/index.js');
let repoPath = '';
let agentScript = '';
let plannerScript = '';

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const task = (id: string, branch = `squad/${id}`, files: string[] = []): Task => ({
  id,
  title: id,
  role: 'default',
  files,
  dependsOn: [],
  prompt: `Implement ${id}.`,
  branch,
});

const resultFor = (entry: Task, status: TaskStatus): TaskResult => ({
  ...entry,
  status,
  log: '',
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T00:01:00.000Z',
});

beforeEach(async () => {
  repoPath = await mkdtemp(join(tmpdir(), 'squad-cli-'));
  await git('init', '--initial-branch=main');
  await git('config', 'user.email', 'squad-test@example.com');
  await git('config', 'user.name', 'Squad Test');
  await writeFile(join(repoPath, 'README.md'), '# fixture\n');
  await git('add', '.');
  await git('commit', '-m', 'base');
  agentScript = join(repoPath, 'agent.cjs');
  plannerScript = join(repoPath, 'planner.cjs');
  await writeFile(
    agentScript,
    "const fs=require('node:fs'); if(process.env.COUNTER)fs.appendFileSync(process.env.COUNTER,'task\\n'); if(process.env.AGENT_EXIT)process.exit(Number(process.env.AGENT_EXIT)); fs.writeFileSync('agent-output.txt','ok\\n');\n",
  );
  await writeFile(
    plannerScript,
    "const fs=require('node:fs'); if(process.env.PLANNER_COUNTER)fs.appendFileSync(process.env.PLANNER_COUNTER,'planner\\n'); console.log(JSON.stringify({tasks:[{id:'planned',title:'Planned',role:'default',files:[],dependsOn:[],prompt:'Implement planned.'}]}));\n",
  );
});

afterEach(async () => {
  await rm(repoPath, { recursive: true, force: true });
});

const git = async (...args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync('git', args, { cwd: repoPath, encoding: 'utf8' });
  return stdout;
};

const gitAt = async (cwd: string, ...args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return stdout;
};

const gitExitCode = async (...args: string[]): Promise<number> => {
  try {
    await git(...args);
    return 0;
  } catch (error) {
    return typeof (error as { code?: unknown }).code === 'number'
      ? (error as { code: number }).code
      : -1;
  }
};

const runCli = async (...args: string[]): Promise<CommandResult> => {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: repoPath,
      encoding: 'utf8',
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: unknown; stderr?: unknown };
    return {
      code: typeof failure.code === 'number' ? failure.code : -1,
      stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
      stderr: typeof failure.stderr === 'string' ? failure.stderr : '',
    };
  }
};

const writeConfig = async (options: { agentExit?: number; counter?: string; plannerCounter?: string } = {}): Promise<void> => {
  await writeFile(
    join(repoPath, 'squad.config.json'),
    `${JSON.stringify({
      baseBranch: 'main',
      integrationBranch: 'squad/integration',
      maxParallel: 1,
      agents: {
        planner: {
          command: [process.execPath, plannerScript],
          env: options.plannerCounter === undefined ? {} : { PLANNER_COUNTER: options.plannerCounter },
        },
        default: {
          command: [process.execPath, agentScript],
          env: {
            ...(options.counter === undefined ? {} : { COUNTER: options.counter }),
            ...(options.agentExit === undefined ? {} : { AGENT_EXIT: String(options.agentExit) }),
          },
        },
      },
    }, null, 2)}\n`,
  );
};

const writePlan = async (currentPlan: Plan): Promise<void> => {
  await mkdir(join(repoPath, '.squad'), { recursive: true });
  await writeFile(join(repoPath, '.squad', 'plan.json'), `${JSON.stringify(currentPlan, null, 2)}\n`);
};

const persistRun = async (runId: string, currentPlan: Plan, statuses: Record<string, TaskStatus>): Promise<void> => {
  const store = await SquadStore.open(join(repoPath, '.squad', 'squad.db'));
  store.createPlannedRun(runId, repoPath, currentPlan);
  store.startPlannedRun(
    runId,
    currentPlan,
    new Map(currentPlan.tasks.map((entry) => [entry.id, join(repoPath, '.squad', 'logs', runId, `${entry.id}.log`)])),
    { type: 'run:start', runId, plan: currentPlan },
  );
  for (const entry of currentPlan.tasks) {
    store.saveTaskResult(runId, resultFor(entry, statuses[entry.id]));
  }
  store.close();
};

const addBranch = async (branch: string, filePath: string, content: string): Promise<void> => {
  await git('checkout', '-b', branch, 'main');
  await writeFile(join(repoPath, filePath), content);
  await git('add', filePath);
  await git('commit', '-m', branch);
  await git('checkout', 'main');
};

const addWorktree = async (runId: string, entry: Task, content: string): Promise<string> => {
  const worktreePath = join(repoPath, '.squad', 'worktrees', runId, entry.id);
  await mkdir(dirname(worktreePath), { recursive: true });
  await git('worktree', 'add', '-b', entry.branch, worktreePath, 'main');
  await writeFile(join(worktreePath, `${entry.id}.txt`), content);
  await gitAt(worktreePath, 'add', '.');
  await gitAt(worktreePath, 'commit', '-m', entry.id);
  return worktreePath;
};

describe('CLI lifecycle and exit codes', () => {
  it('keeps init idempotent without --force', async () => {
    const first = await runCli('init');
    const second = await runCli('init');

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('already exists');
  });

  it('returns exit 1 when a task agent fails', async () => {
    await writeConfig({ agentExit: 1 });
    await writePlan({ goal: 'fail', tasks: [task('fail')] });

    expect((await runCli('run')).code).toBe(1);
  });

  it('does not invoke the planner again when run reads planFile', async () => {
    const plannerCounter = join(repoPath, 'planner-counter.txt');
    await writeConfig({ plannerCounter });
    await writePlan({ goal: 'manual', tasks: [task('manual')] });

    const command = await runCli('run');

    expect(command.code).toBe(0);
    await expect(readFile(plannerCounter, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('blocks conflicts without --force and runs them with --force', async () => {
    const counter = join(repoPath, 'task-counter.txt');
    await writeConfig({ counter });
    await writePlan({
      goal: 'conflict',
      tasks: [task('a', 'squad/a', ['shared.txt']), task('b', 'squad/b', ['shared.txt'])],
    });

    expect((await runCli('run')).code).toBe(1);
    await expect(readFile(counter, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await runCli('run', '--force')).code).toBe(0);
    expect((await readFile(counter, 'utf8')).trim().split(/\r?\n/)).toHaveLength(2);
  });

  it('returns exit 1 when merge reports a real conflict', async () => {
    await writeConfig();
    const conflict = task('conflict', 'squad/conflict');
    await addBranch(conflict.branch, 'shared.txt', 'branch\n');
    await writeFile(join(repoPath, 'shared.txt'), 'main\n');
    await git('add', 'shared.txt');
    await git('commit', '-m', 'main conflict');
    await persistRun('merge-conflict', { goal: 'merge', tasks: [conflict] }, { conflict: 'passed' });

    expect((await runCli('merge', 'merge-conflict')).code).toBe(1);
  });
});

describe('CLI clean safety and retention', () => {
  it('keeps a running worktree when cleaning all runs', async () => {
    await writeConfig();
    const running = task('running', 'squad/running');
    const worktreePath = await addWorktree('running-run', running, 'running\n');
    await persistRun('running-run', { goal: 'running', tasks: [running] }, { running: 'running' });

    expect((await runCli('clean')).code).toBe(0);
    await expect(readFile(join(worktreePath, 'running.txt'), 'utf8')).resolves.toBe('running\n');
  });

  it('deletes merged branches but keeps unmerged branches while removing both worktrees', async () => {
    await writeConfig();
    const merged = task('merged', 'squad/merged');
    const unmerged = task('unmerged', 'squad/unmerged');
    const mergedWorktree = await addWorktree('merged-run', merged, 'merged\n');
    const unmergedWorktree = await addWorktree('unmerged-run', unmerged, 'unmerged\n');
    await git('merge', '--no-ff', '--no-edit', merged.branch);
    await persistRun('merged-run', { goal: 'merged', tasks: [merged] }, { merged: 'passed' });
    await persistRun('unmerged-run', { goal: 'unmerged', tasks: [unmerged] }, { unmerged: 'agent_failed' });

    const command = await runCli('clean', '--delete-branches');

    expect(command.code).toBe(0);
    expect(command.stdout).toContain(`Keeping branch ${unmerged.branch}`);
    await expect(readFile(join(mergedWorktree, 'merged.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(unmergedWorktree, 'unmerged.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await gitExitCode('show-ref', '--verify', '--quiet', `refs/heads/${merged.branch}`)).toBe(1);
    expect(await gitExitCode('show-ref', '--verify', '--quiet', `refs/heads/${unmerged.branch}`)).toBe(0);
  });

  it('removes logs only when --logs is requested', async () => {
    await writeConfig();
    const finished = task('finished', 'squad/finished');
    await addWorktree('logs-run', finished, 'finished\n');
    await persistRun('logs-run', { goal: 'logs', tasks: [finished] }, { finished: 'agent_failed' });
    const logPath = join(repoPath, '.squad', 'logs', 'logs-run', 'finished.log');
    await mkdir(dirname(logPath), { recursive: true });
    await writeFile(logPath, 'retained by default\n');

    expect((await runCli('clean')).code).toBe(0);
    expect(await readFile(logPath, 'utf8')).toBe('retained by default\n');
    expect((await runCli('clean', '--logs')).code).toBe(0);
    await expect(readFile(logPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
