import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSquadConfig, type LoadedSquadConfig } from '../src/config.js';
import { PlanError } from '../src/planner.js';
import { reconcileOrphanedTasks, SquadOrchestrator } from '../src/runner.js';
import { SquadStore } from '../src/store.js';
import type { Plan, Task } from '../src/types.js';

const execFileAsync = promisify(execFile);
let repoPath = '';
let plannerScript = '';
let runnerScript = '';

const task = (id: string, dependsOn: string[] = []): Task => ({
  id,
  title: id,
  role: 'default',
  files: [],
  dependsOn,
  prompt: `Implement ${id}.`,
  branch: `squad/${id}`,
});

const plan = (id: string, dependsOn: string[] = []): Plan => ({
  goal: `Goal ${id}`,
  tasks: [task(id, dependsOn)],
});

beforeEach(async () => {
  repoPath = await mkdtemp(join(tmpdir(), 'squad-orchestrator-'));
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.email', 'squad-test@example.com'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.name', 'Squad Test'], { cwd: repoPath });
  await writeFile(join(repoPath, 'README.md'), '# fixture\n');
  await execFileAsync('git', ['add', '.'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-m', 'base'], { cwd: repoPath });
  plannerScript = join(repoPath, 'planner.cjs');
  runnerScript = join(repoPath, 'runner.cjs');
  await writeFile(
    plannerScript,
    "process.stdin.resume(); process.stdin.on('end',()=>{console.log('planner chunk'); console.log(JSON.stringify({tasks:[{id:'generated',title:'Generated',role:'default',files:[],dependsOn:[],prompt:'Do it.'}]}));});\n",
  );
  await writeFile(
    runnerScript,
    "const fs=require('node:fs'); const prompt=process.argv.at(-1)||''; const id=(prompt.match(/TASK:([\\w-]+)/)||[])[1]||'unknown'; const timeline=process.env.TIMELINE; const note=(value)=>timeline&&fs.appendFileSync(timeline,value+'\\n'); note('start:'+id); const finish=()=>{if(prompt.includes('FAIL'))process.exit(1); console.log('agent:'+id); fs.writeFileSync('changed-'+id+'.txt','ok\\n'); note('end:'+id);}; setTimeout(finish,prompt.includes('SLOW')?180:0);\n",
  );
  await writeFile(
    join(repoPath, 'squad.config.json'),
    JSON.stringify({ agents: { default: { command: [process.execPath, '-e', 'process.exit(0)'] } } }),
  );
});

afterEach(async () => {
  await rm(repoPath, { recursive: true, force: true });
});

const loadedConfig = (): LoadedSquadConfig => ({
  config: parseSquadConfig({
    agents: {
      planner: { command: [process.execPath, plannerScript] },
      default: { command: [process.execPath, '-e', 'process.exit(0)'] },
    },
  }),
  configPath: join(repoPath, 'squad.config.json'),
  configDirectory: repoPath,
});

const runnerConfig = (maxParallel: number, verify: string[] = [], timeline?: string): LoadedSquadConfig => ({
  config: parseSquadConfig({
    permissionMode: 'full',
    maxParallel,
    verify,
    agents: {
      default: {
        command: [process.execPath, runnerScript, '{{prompt}}'],
        ...(timeline === undefined ? {} : { env: { TIMELINE: timeline } }),
      },
    },
  }),
  configPath: join(repoPath, 'squad.config.json'),
  configDirectory: repoPath,
});

describe('planning events and persisted plans', () => {
  it('emits plan:start, plan:log, then plan:done after the planned row exists', async () => {
    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: loadedConfig(), store });
    const events: string[] = [];
    let storedDuringDone = false;
    orchestrator.on('plan:start', () => events.push('plan:start'));
    orchestrator.on('plan:log', () => events.push('plan:log'));
    orchestrator.on('plan:done', (event) => {
      events.push('plan:done');
      storedDuringDone = store.getRun(event.runId)?.status === 'planned';
    });

    const result = await orchestrator.makePlan(repoPath, 'Generate one task');

    expect(events[0]).toBe('plan:start');
    expect(events.at(-1)).toBe('plan:done');
    expect(events.filter((event) => event === 'plan:log').length).toBeGreaterThan(0);
    expect(storedDuringDone).toBe(true);
    expect(store.getRun(result.runId)?.plan).toEqual(result.plan);
    store.close();
  });

  it('rejects a cyclic public plan before persisting any run', async () => {
    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: loadedConfig(), store });
    const cyclic: Plan = {
      goal: 'cycle',
      tasks: [task('a', ['b']), task('b', ['a'])],
    };

    await expect(orchestrator.createRunFromPlan(repoPath, cyclic)).rejects.toMatchObject({
      code: 'PLAN_INVALID',
    } satisfies Partial<PlanError>);
    expect(store.listRuns(20)).toEqual([]);
    store.close();
  });

  it('persists each valid hand-edited plan under a new run id', async () => {
    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: loadedConfig(), store });
    const input = plan('manual');

    const first = await orchestrator.createRunFromPlan(repoPath, input);
    const second = await orchestrator.createRunFromPlan(repoPath, input);

    expect(first.runId).not.toBe(second.runId);
    expect(store.getRun(first.runId)?.plan).toEqual(input);
    expect(store.getRun(second.runId)?.status).toBe('planned');
    store.close();
  });
});

describe('store history queries', () => {
  it('returns exactly the ten newest runs', async () => {
    const store = await SquadStore.open(':memory:');
    for (let index = 0; index < 12; index += 1) {
      store.createPlannedRun(
        `run-${index}`,
        repoPath,
        plan(`task-${index}`),
        new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      );
    }

    expect(store.listRuns(10).map((run) => run.id)).toEqual([
      'run-11', 'run-10', 'run-9', 'run-8', 'run-7', 'run-6', 'run-5', 'run-4', 'run-3', 'run-2',
    ]);
    store.close();
  });

  it('returns tasks belonging to multiple runs for global cleanup', async () => {
    const store = await SquadStore.open(':memory:');
    const first = plan('first');
    const second = plan('second');
    for (const [runId, currentPlan] of [['run-a', first], ['run-b', second]] as const) {
      store.createPlannedRun(runId, repoPath, currentPlan);
      store.startPlannedRun(
        runId,
        currentPlan,
        new Map(currentPlan.tasks.map((entry) => [entry.id, join(repoPath, `${runId}-${entry.id}.log`)])),
        { type: 'run:start', runId, plan: currentPlan },
      );
    }

    expect(store.listAllTasks().map((entry) => `${entry.runId}/${entry.id}`)).toEqual([
      'run-a/first',
      'run-b/second',
    ]);
    store.close();
  });
});

describe('orphaned run reconciliation', () => {
  it('interrupts every unfinished task only when the persisted coordinator PID is dead', async () => {
    const currentPlan: Plan = { goal: 'orphaned', tasks: [task('running'), task('pending')] };
    const dbFile = join(repoPath, '.squad', 'squad.db');
    const store = await SquadStore.open(dbFile);
    store.createPlannedRun('orphaned-run', repoPath, currentPlan);
    store.startPlannedRun(
      'orphaned-run',
      currentPlan,
      new Map(currentPlan.tasks.map((entry) => [entry.id, join(repoPath, `${entry.id}.log`)])),
      { type: 'run:start', runId: 'orphaned-run', plan: currentPlan },
      2_147_483_647,
    );
    store.recordTaskStarted('orphaned-run', 'running', new Date().toISOString(), {
      type: 'task:start', runId: 'orphaned-run', taskId: 'running',
    });
    store.setTaskPid('orphaned-run', 'running', 12_345);
    store.close();

    await expect(reconcileOrphanedTasks(repoPath)).resolves.toEqual(['orphaned-run']);

    const reopened = await SquadStore.open(dbFile);
    expect(reopened.getRun('orphaned-run')).toMatchObject({ status: 'interrupted', pid: null });
    expect(reopened.getRun('orphaned-run')?.endedAt).not.toBeNull();
    expect(reopened.listTasks('orphaned-run').map(({ id, status, pid }) => ({ id, status, pid }))).toEqual([
      { id: 'pending', status: 'interrupted', pid: null },
      { id: 'running', status: 'interrupted', pid: null },
    ]);
    reopened.close();
  });

  it('leaves a run alone while its coordinator PID is still alive', async () => {
    const currentPlan = plan('alive');
    const dbFile = join(repoPath, '.squad', 'squad.db');
    const store = await SquadStore.open(dbFile);
    store.createPlannedRun('alive-run', repoPath, currentPlan);
    store.startPlannedRun(
      'alive-run',
      currentPlan,
      new Map([['alive', join(repoPath, 'alive.log')]]),
      { type: 'run:start', runId: 'alive-run', plan: currentPlan },
      process.pid,
    );
    store.close();

    await expect(reconcileOrphanedTasks(repoPath)).resolves.toEqual([]);

    const reopened = await SquadStore.open(dbFile);
    expect(reopened.getRun('alive-run')).toMatchObject({ status: 'running', pid: process.pid });
    expect(reopened.listTasks('alive-run')[0]).toMatchObject({ status: 'pending', pid: null });
    reopened.close();
  });
});

describe('runner execution with fake agents', () => {
  it('persists the coordinator and agent-child PIDs before emitting the first task log', async () => {
    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: runnerConfig(1), store });
    const currentPlan: Plan = { goal: 'pid persistence', tasks: [{ ...task('pid'), prompt: 'TASK:pid' }] };
    store.createPlannedRun('pid-run', repoPath, currentPlan);
    let observed: { runPid: number | null; taskPid: number | null } | undefined;
    orchestrator.on('task:log', () => {
      observed = {
        runPid: store.getRun('pid-run')?.pid ?? null,
        taskPid: store.listTasks('pid-run')[0]?.pid ?? null,
      };
    });

    const [result] = await orchestrator.runPlan(repoPath, currentPlan, 'pid-run');

    expect(result.error).toBeUndefined();
    expect(result.status).toBe('passed');
    expect(observed?.runPid).toBe(process.pid);
    expect(observed?.taskPid).toBeGreaterThan(0);
    await expect(
      readFile(join(repoPath, '.squad', 'logs', 'pid-run', 'pid.log'), 'utf8'),
    ).resolves.toContain('agent:pid');
    expect(store.getRun('pid-run')?.pid).toBeNull();
    expect(store.listTasks('pid-run')[0]?.pid).toBeNull();
    store.close();
  });

  it('runs independent tasks in parallel while starting a dependent task only after its parent ends', async () => {
    const timeline = join(repoPath, 'timeline.log');
    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: runnerConfig(2, [], timeline), store });
    const parent = { ...task('parent'), prompt: 'TASK:parent SLOW' };
    const independent = { ...task('independent'), prompt: 'TASK:independent SLOW' };
    const child = { ...task('child', ['parent']), prompt: 'TASK:child' };
    const currentPlan: Plan = { goal: 'dependency', tasks: [parent, independent, child] };
    store.createPlannedRun('dependency-run', repoPath, currentPlan);

    const results = await orchestrator.runPlan(repoPath, currentPlan, 'dependency-run');
    const events = (await readFile(timeline, 'utf8')).trim().split(/\r?\n/);

    expect(results.map((result) => result.status)).toEqual(['passed', 'passed', 'passed']);
    expect(events.indexOf('start:independent')).toBeLessThan(events.indexOf('end:parent'));
    expect(events.indexOf('start:child')).toBeGreaterThan(events.indexOf('end:parent'));
    store.close();
  });

  it('skips only dependent tasks after an agent failure while independent work still passes', async () => {
    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: runnerConfig(2), store });
    const failed = { ...task('failed'), prompt: 'TASK:failed FAIL' };
    const skipped = { ...task('skipped', ['failed']), prompt: 'TASK:skipped' };
    const independent = { ...task('independent'), prompt: 'TASK:independent' };
    const currentPlan: Plan = { goal: 'failure', tasks: [failed, skipped, independent] };
    store.createPlannedRun('failure-run', repoPath, currentPlan);

    const results = await orchestrator.runPlan(repoPath, currentPlan, 'failure-run');

    expect(results.map((result) => result.status)).toEqual(['agent_failed', 'skipped', 'passed']);
    await expect(
      execFileAsync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/squad/integration'], { cwd: repoPath }),
    ).rejects.toBeTruthy();
    store.close();
  });

  it('marks a failing task verify as verify_failed and never auto-merges its branch', async () => {
    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: runnerConfig(1), store });
    const verified = {
      ...task('verify'),
      prompt: 'TASK:verify',
      verify: `${process.execPath} -e "process.exit(1)"`,
    };
    const currentPlan: Plan = { goal: 'verify', tasks: [verified] };
    store.createPlannedRun('verify-run', repoPath, currentPlan);

    const [result] = await orchestrator.runPlan(repoPath, currentPlan, 'verify-run');

    expect(result.status).toBe('verify_failed');
    await expect(
      execFileAsync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/squad/integration'], { cwd: repoPath }),
    ).rejects.toBeTruthy();
    store.close();
  });
});
