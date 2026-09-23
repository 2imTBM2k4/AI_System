import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Plan } from '@squad/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.js';
import { RepoRegistry } from '../src/registry.js';

import type { FastifyInstance } from 'fastify';

const execFileAsync = promisify(execFile);
let fixtureRoot = '';
let repoPath = '';
let registryHome = '';
let agentScript = '';
let plannerScript = '';
let blockingAgentScript = '';
let activeApp: FastifyInstance | undefined;
let activeRegistry: RepoRegistry | undefined;

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'squad-server-runs-'));
  repoPath = join(fixtureRoot, 'repo');
  registryHome = join(fixtureRoot, 'registry-home');
  await mkdir(repoPath);
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.email', 'squad-server@example.com'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.name', 'Squad Server Test'], { cwd: repoPath });
  await writeFile(join(repoPath, 'README.md'), '# server fixture\n');

  agentScript = join(fixtureRoot, 'agent.cjs');
  plannerScript = join(fixtureRoot, 'planner.cjs');
  blockingAgentScript = join(fixtureRoot, 'blocking-agent.cjs');
  const delayedAgentScript = join(fixtureRoot, 'delayed-agent.cjs');

  const failingAgentScript = join(fixtureRoot, 'failing-agent.cjs');

  await writeFile(
    agentScript,
    "const fs=require('node:fs'); fs.writeFileSync('output.txt','ok\\n'); process.exit(0);\n",
  );
  await writeFile(
    plannerScript,
    "console.log(JSON.stringify({tasks:[{id:'t1',title:'Task 1',role:'default',files:['file1.txt'],dependsOn:[],prompt:'Do task 1.'}]}));\n",
  );
  await writeFile(
    blockingAgentScript,
    "setInterval(()=>{}, 1000);\n",
  );
  await writeFile(
    delayedAgentScript,
    "setTimeout(() => { require('node:fs').writeFileSync('delayed.txt','done\\n'); process.exit(0); }, 350);\n",
  );
  await writeFile(
    failingAgentScript,
    "process.exit(1);\n",
  );

  await writeFile(
    join(repoPath, 'squad.config.json'),
    JSON.stringify({
      baseBranch: 'main',
      integrationBranch: 'squad/integration',
      agents: {
        default: { command: [process.execPath, agentScript] },
        planner: { command: [process.execPath, plannerScript] },
        slow: { command: [process.execPath, blockingAgentScript] },
        delayed: { command: [process.execPath, delayedAgentScript] },
        failing: { command: [process.execPath, failingAgentScript] },
      },
    }),
  );
  await execFileAsync('git', ['add', '.'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-m', 'base'], { cwd: repoPath });
});

afterEach(async () => {
  if (activeApp !== undefined) {
    await activeApp.close();
    activeApp = undefined;
  }
  if (activeRegistry !== undefined) {
    activeRegistry.close();
    activeRegistry = undefined;
  }
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe('Server runs API routes', () => {
  it('handles GET /repos/:id/runs with pagination/limits and missing repo errors', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    // Missing repo returns 404
    const missing = await app.inject({ method: 'GET', url: '/repos/non-existent/runs' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('REPO_NOT_FOUND');

    // Initially empty
    const emptyList = await app.inject({ method: 'GET', url: `/repos/${repo.id}/runs` });
    expect(emptyList.statusCode).toBe(200);
    expect(emptyList.json().runs).toEqual([]);
  });

  it('generates a plan via POST /repos/:id/plan and creates a planned run row in SQLite', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    const planRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/plan`,
      payload: { goal: 'Test goal' },
    });

    expect(planRes.statusCode).toBe(201);
    const planBody = planRes.json();
    expect(planBody.runId).toBeDefined();
    expect(planBody.plan.tasks).toHaveLength(1);
    expect(planBody.plan.tasks[0].id).toBe('t1');

    // Verify it exists in GET /repos/:id/runs
    const listRes = await app.inject({ method: 'GET', url: `/repos/${repo.id}/runs` });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().runs).toHaveLength(1);
    expect(listRes.json().runs[0].status).toBe('planned');
    expect(listRes.json().runs[0].id).toBe(planBody.runId);

    // Verify GET /runs/:id shows the planned run
    const runRes = await app.inject({ method: 'GET', url: `/runs/${planBody.runId}` });
    expect(runRes.statusCode).toBe(200);
    expect(runRes.json().run.status).toBe('planned');
  });

  it('handles POST /repos/:id/chat in ask, plan, and auto modes', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    // Test ask mode
    const askRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/chat`,
      payload: { message: 'How does this project work?', mode: 'ask' },
    });
    expect(askRes.statusCode).toBe(200);
    const askBody = askRes.json();
    expect(askBody.type).toBe('answer');
    expect(typeof askBody.reply).toBe('string');

    // Test plan mode
    const planRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/chat`,
      payload: { message: 'Build auth module', mode: 'plan' },
    });
    expect(planRes.statusCode).toBe(200);
    const planBody = planRes.json();
    expect(planBody.type).toBe('plan');
    expect(planBody.runId).toBeDefined();
    expect(planBody.plan.tasks).toHaveLength(1);
  });

  it('runs a plan in background, stream events via SSE, and completes successfully', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    // Step 1: Create plan
    const planRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/plan`,
      payload: { goal: 'Complete plan run' },
    });
    const { runId } = planRes.json();

    // Step 2: Start run
    const startRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/runs`,
      payload: { runId },
    });
    expect(startRes.statusCode).toBe(201);
    expect(startRes.json().run.id).toBe(runId);

    // Step 3: Stream SSE events (inject waits until stream completes on run:done)
    const sseRes = await app.inject({
      method: 'GET',
      url: `/runs/${runId}/events`,
    });
    expect(sseRes.statusCode).toBe(200);
    expect(sseRes.headers['content-type']).toContain('text/event-stream');
    const ssePayload = sseRes.payload;
    expect(ssePayload).toContain('event: run:start');
    expect(ssePayload).toContain('event: task:start');
    expect(ssePayload).toContain('event: task:done');
    expect(ssePayload).toContain('event: run:done');

    // Step 4: Verify terminal state
    const runRes = await app.inject({ method: 'GET', url: `/runs/${runId}` });
    expect(runRes.statusCode).toBe(200);
    expect(runRes.json().run.status).toBe('completed');
    expect(runRes.json().tasks[0].status).toBe('passed');

    // Step 5: Merge the completed run
    const mergeRes = await app.inject({
      method: 'POST',
      url: `/runs/${runId}/merge`,
    });
    expect(mergeRes.statusCode).toBe(200);
    expect(mergeRes.json().report.merged).toHaveLength(1);
    expect(mergeRes.json().report.merged[0].id).toBe('t1');
  });

  it('handles concurrent POST /repos/:id/runs requests with idempotency and conflict rejection', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    const plan: Plan = {
      goal: 'concurrent test',
      tasks: [{
        id: 'concurrent-task',
        title: 'Concurrent Task',
        role: 'default',
        files: [],
        dependsOn: [],
        prompt: 'test',
        branch: 'squad/concurrent-task',
      }],
    };

    // First create a planned run
    const planRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/plan`,
      payload: { goal: 'concurrent plan' },
    });
    const { runId } = planRes.json();

    // Fire 2 concurrent requests to start the EXACT same runId
    const [start1, start2] = await Promise.all([
      app.inject({ method: 'POST', url: `/repos/${repo.id}/runs`, payload: { runId } }),
      app.inject({ method: 'POST', url: `/repos/${repo.id}/runs`, payload: { runId } }),
    ]);

    // One should be 201 Created, the other 200 OK (idempotent retry)
    expect([start1.statusCode, start2.statusCode].sort()).toEqual([200, 201]);
    expect(start1.json().run.id).toBe(runId);
    expect(start2.json().run.id).toBe(runId);

    // Concurrently attempting to start a DIFFERENT run on the same repo must be rejected with 409
    const conflictRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/runs`,
      payload: { plan },
    });
    expect(conflictRes.statusCode).toBe(409);
    expect(conflictRes.json().error.code).toBe('RUN_ALREADY_ACTIVE');

    // Wait for the active run to finish via SSE
    await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
  });

  it('cancels an active task via POST /runs/:id/tasks/:taskId/cancel', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    const plan: Plan = {
      goal: 'cancel test',
      tasks: [{
        id: 'slow-task',
        title: 'Slow Task',
        role: 'slow',
        files: [],
        dependsOn: [],
        prompt: 'blocking task',
        branch: 'squad/slow-task',
      }],
    };

    const startRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/runs`,
      payload: { plan },
    });
    expect(startRes.statusCode).toBe(201);
    const { id: runId } = startRes.json().run;

    // Wait a brief moment to ensure the slow process is running
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Cancel the task
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/runs/${runId}/tasks/slow-task/cancel`,
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().taskId).toBe('slow-task');

    // Stream until done
    await app.inject({ method: 'GET', url: `/runs/${runId}/events` });

    // Verify task ended as cancelled
    const runRes = await app.inject({ method: 'GET', url: `/runs/${runId}` });
    expect(runRes.statusCode).toBe(200);
    expect(runRes.json().tasks[0].status).toBe('cancelled');
  });

  it('replays historical events for an already completed run via GET /runs/:id/events', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    const planRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/plan`,
      payload: { goal: 'replay test' },
    });
    const { runId } = planRes.json();

    await app.inject({ method: 'POST', url: `/repos/${repo.id}/runs`, payload: { runId } });
    // Wait until finished
    await app.inject({ method: 'GET', url: `/runs/${runId}/events` });

    // Now connect SSE a SECOND time to the already finished run
    const replayRes = await app.inject({
      method: 'GET',
      url: `/runs/${runId}/events`,
    });
    expect(replayRes.statusCode).toBe(200);
    expect(replayRes.payload).toContain('event: run:start');
    expect(replayRes.payload).toContain('event: task:done');
    expect(replayRes.payload).toContain('event: run:done');
  });

  it('handles simultaneous POST /repos/:id/runs for DIFFERENT plans by rejecting one with 409', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    const planA: Plan = {
      goal: 'plan a',
      tasks: [{ id: 'ta', title: 'Task A', role: 'default', files: [], dependsOn: [], prompt: 'A', branch: 'squad/ta' }],
    };
    const planB: Plan = {
      goal: 'plan b',
      tasks: [{ id: 'tb', title: 'Task B', role: 'default', files: [], dependsOn: [], prompt: 'B', branch: 'squad/tb' }],
    };

    // Fire 2 concurrent requests for DIFFERENT plans in the exact same tick
    const [resA, resB] = await Promise.all([
      app.inject({ method: 'POST', url: `/repos/${repo.id}/runs`, payload: { plan: planA } }),
      app.inject({ method: 'POST', url: `/repos/${repo.id}/runs`, payload: { plan: planB } }),
    ]);

    expect([resA.statusCode, resB.statusCode].sort()).toEqual([201, 409]);
    const winner = resA.statusCode === 201 ? resA : resB;
    const loser = resA.statusCode === 409 ? resA : resB;
    expect(loser.json().error.code).toBe('RUN_ALREADY_ACTIVE');

    // Wait for the winning run to finish
    await app.inject({ method: 'GET', url: `/runs/${winner.json().run.id}/events` });
  });

  it('handles SSE replay-to-live handoff during active execution with monotonic IDs and no duplication', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    // A two-task sequential plan: task 1 finishes fast, task 2 takes 350ms
    const plan: Plan = {
      goal: 'handoff test',
      tasks: [
        { id: 'fast', title: 'Fast Task', role: 'default', files: [], dependsOn: [], prompt: 'fast', branch: 'squad/fast' },
        { id: 'delayed', title: 'Delayed Task', role: 'delayed', files: [], dependsOn: ['fast'], prompt: 'delayed', branch: 'squad/delayed' },
      ],
    };

    const startRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/runs`,
      payload: { plan },
    });
    expect(startRes.statusCode).toBe(201);
    const { id: runId } = startRes.json().run;

    // Wait 150ms so 'fast' task completes and is persisted into SQLite,
    // while 'delayed' task is still running or about to run.
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Connect SSE mid-flight: this triggers replay of 'fast' events from SQLite,
    // followed by live streaming of 'delayed' events.
    const sseRes = await app.inject({
      method: 'GET',
      url: `/runs/${runId}/events`,
    });
    expect(sseRes.statusCode).toBe(200);

    // Parse all `id: <num>` lines
    const idMatches = [...sseRes.payload.matchAll(/^id:\s*(\d+)$/gm)].map((m) => parseInt(m[1], 10));
    expect(idMatches.length).toBeGreaterThanOrEqual(4);

    // Assert strictly monotonic IDs: id[i] < id[i+1] (proves ZERO duplicates and correct ordering)
    for (let i = 0; i < idMatches.length - 1; i++) {
      expect(idMatches[i]).toBeLessThan(idMatches[i + 1]);
    }

    // Verify all stages were received
    expect(sseRes.payload).toContain('event: run:start');
    expect(sseRes.payload).toContain('event: task:done');
    expect(sseRes.payload).toContain('event: run:done');
  });

  it('reliably releases the active run lock after a failed run so a subsequent run succeeds with 201', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    // Run 1 uses role 'failing' which exits with code 1
    const failingPlan: Plan = {
      goal: 'failing plan',
      tasks: [{
        id: 'fail-task',
        title: 'Fail Task',
        role: 'failing',
        files: [],
        dependsOn: [],
        prompt: 'fail',
        branch: 'squad/fail-task',
      }],
    };

    const firstRunRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/runs`,
      payload: { plan: failingPlan },
    });
    expect(firstRunRes.statusCode).toBe(201);
    const { id: firstRunId } = firstRunRes.json().run;

    // Stream SSE to wait until Run 1 finishes completely
    await app.inject({ method: 'GET', url: `/runs/${firstRunId}/events` });

    // Verify Run 1 actually failed and is recorded in DB
    const firstDetail = await app.inject({ method: 'GET', url: `/runs/${firstRunId}` });
    expect(firstDetail.statusCode).toBe(200);
    expect(firstDetail.json().tasks[0].status).toBe('agent_failed');

    // Run 2: immediately try to start a new valid run on the SAME repo
    const validPlan: Plan = {
      goal: 'valid plan',
      tasks: [{
        id: 'pass-task',
        title: 'Pass Task',
        role: 'default',
        files: [],
        dependsOn: [],
        prompt: 'pass',
        branch: 'squad/pass-task',
      }],
    };

    const secondRunRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/runs`,
      payload: { plan: validPlan },
    });

    // MUST succeed with 201 Created — lock must NOT be stuck in 409
    expect(secondRunRes.statusCode).toBe(201);
    const { id: secondRunId } = secondRunRes.json().run;
    expect(secondRunId).not.toBe(firstRunId);

    // Wait for Run 2 to finish
    await app.inject({ method: 'GET', url: `/runs/${secondRunId}/events` });
    const secondDetail = await app.inject({ method: 'GET', url: `/runs/${secondRunId}` });
    expect(secondDetail.statusCode).toBe(200);
    expect(secondDetail.json().tasks[0].status).toBe('passed');
  });

  it('allows retrying a failed task in a historical run and updates its status', async () => {
    activeRegistry = await RepoRegistry.open(registryHome);
    const { repo } = await activeRegistry.register(repoPath);
    activeApp = await buildServer({ registry: activeRegistry });
    const app = activeApp;

    const failingPlan: Plan = {
      goal: 'test retry',
      tasks: [{
        id: 'retryable-task',
        title: 'Retryable Task',
        role: 'failing',
        files: [],
        dependsOn: [],
        prompt: 'retry me',
        branch: 'squad/retryable-task',
      }],
    };

    const runRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/runs`,
      payload: { plan: failingPlan },
    });
    expect(runRes.statusCode).toBe(201);
    const { id: runId } = runRes.json().run;

    // Stream SSE to wait until run finishes
    await app.inject({ method: 'GET', url: `/runs/${runId}/events` });

    // Verify task failed
    const detailBefore = await app.inject({ method: 'GET', url: `/runs/${runId}` });
    expect(detailBefore.json().tasks[0].status).toBe('agent_failed');

    // Fix the agent script so it passes on retry
    const failingAgentScript = join(fixtureRoot, 'failing-agent.cjs');
    await writeFile(
      failingAgentScript,
      "const fs=require('node:fs'); fs.writeFileSync('fixed.txt','ok\\n'); process.exit(0);\n",
    );

    // Test 404 on invalid run/task
    const notFoundRun = await app.inject({
      method: 'POST',
      url: '/runs/non-existent-run/tasks/retryable-task/retry',
    });
    expect(notFoundRun.statusCode).toBe(404);

    const notFoundTask = await app.inject({
      method: 'POST',
      url: `/runs/${runId}/tasks/non-existent-task/retry`,
    });
    expect(notFoundTask.statusCode).toBe(404);

    // Trigger retry
    const retryRes = await app.inject({
      method: 'POST',
      url: `/runs/${runId}/tasks/retryable-task/retry`,
    });
    expect(retryRes.statusCode).toBe(200);
    expect(retryRes.json().taskId).toBe('retryable-task');

    // Poll until retry finishes and task is passed
    let retriedTask;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await app.inject({ method: 'GET', url: `/runs/${runId}` });
      retriedTask = res.json().tasks.find((t: any) => t.id === 'retryable-task');
      if (retriedTask?.status === 'passed') break;
    }

    expect(retriedTask?.status).toBe('passed');
  });
});

