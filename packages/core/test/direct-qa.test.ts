import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSquadConfig, type LoadedSquadConfig } from '../src/config.js';
import { SquadOrchestrator } from '../src/runner.js';
import { SquadStore } from '../src/store.js';
import type { Plan, SquadEvent, Task } from '../src/types.js';

const execFileAsync = promisify(execFile);
let repoPath = '';
let runnerScript = '';
let reviewerScript = '';

beforeEach(async () => {
  repoPath = await mkdtemp(join(tmpdir(), 'squad-direct-qa-'));
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.email', 'squad-test@example.com'], { cwd: repoPath });
  await execFileAsync('git', ['config', 'user.name', 'Squad Test'], { cwd: repoPath });
  await writeFile(join(repoPath, 'README.md'), '# fixture\n');
  await execFileAsync('git', ['add', '.'], { cwd: repoPath });
  await execFileAsync('git', ['commit', '-m', 'base'], { cwd: repoPath });

  runnerScript = join(repoPath, 'runner.cjs');
  reviewerScript = join(repoPath, 'reviewer.cjs');

  // Fake runner that outputs code with FILE: marker
  await writeFile(
    runnerScript,
    `const fs = require('node:fs');
const prompt = process.argv.at(-1) || '';
if (prompt.includes('CREATE_FEATURE')) {
  fs.writeFileSync('feature.txt', 'feature v1\\n');
}
if (prompt.includes('FIX_FEATURE')) {
  fs.writeFileSync('feature.txt', 'feature v2 fixed\\n');
}
console.log('runner executed: ' + prompt);
`,
  );

  // Fake reviewer that asks for fix on round 1 and passes on round 2
  await writeFile(
    reviewerScript,
    `const fs = require('node:fs');
const content = fs.existsSync('feature.txt') ? fs.readFileSync('feature.txt', 'utf8') : '';
if (!content.includes('fixed')) {
  console.log(JSON.stringify({
    status: 'needs_fix',
    summary: 'Feature needs fix',
    fixTasks: [{
      id: 'fix-1',
      title: 'Fix Feature',
      role: 'default',
      files: ['feature.txt'],
      prompt: 'FIX_FEATURE'
    }]
  }));
} else {
  console.log(JSON.stringify({
    status: 'passed',
    summary: 'All requirements satisfied.'
  }));
}
`,
  );
});

afterEach(async () => {
  await rm(repoPath, { recursive: true, force: true });
});

const directQaConfig = (maxReviewRounds = 2): LoadedSquadConfig => ({
  config: parseSquadConfig({
    executionMode: 'direct',
    maxReviewRounds,
    agents: {
      default: {
        command: [process.execPath, runnerScript, '{{prompt}}'],
      },
      reviewer: {
        command: [process.execPath, reviewerScript, '{{prompt}}'],
      },
    },
  }),
  configPath: join(repoPath, 'squad.config.json'),
  configDirectory: repoPath,
});

describe('Direct Workspace Execution and Lead QA Review Loop', () => {
  it('executes tasks in-place, runs QA loop, applies fix task, and passes', async () => {
    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: directQaConfig(2), store });

    const initialPlan: Plan = {
      goal: 'Implement and verify feature',
      tasks: [
        {
          id: 't1',
          title: 'Create initial feature',
          role: 'default',
          files: ['feature.txt'],
          dependsOn: [],
          prompt: 'CREATE_FEATURE',
          branch: 'squad/t1',
        },
      ],
    };

    store.createPlannedRun('direct-run-1', repoPath, initialPlan);

    const emittedEvents: string[] = [];
    orchestrator.on('review:start', (e: SquadEvent) => {
      if (e.type === 'review:start') emittedEvents.push(`review:start:${e.round}`);
    });
    orchestrator.on('review:done', (e: SquadEvent) => {
      if (e.type === 'review:done') emittedEvents.push(`review:done:${e.round}:${e.result.status}`);
    });

    const results = await orchestrator.runPlan(repoPath, initialPlan, 'direct-run-1');

    // Both initial task t1 and fix task fix-1 should be in results
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('t1');
    expect(results[0].status).toBe('passed');
    expect(results[1].id).toBe('fix-1');
    expect(results[1].status).toBe('passed');

    // Verify file on disk was modified by the fix task
    const fileContent = await readFile(join(repoPath, 'feature.txt'), 'utf8');
    expect(fileContent).toContain('feature v2 fixed');

    // Verify review events: round 1 needs_fix, round 2 passed
    expect(emittedEvents).toContain('review:start:1');
    expect(emittedEvents).toContain('review:done:1:needs_fix');
    expect(emittedEvents).toContain('review:start:2');
    expect(emittedEvents).toContain('review:done:2:passed');

    // Verify git log contains checkpoint commits on the main branch
    const { stdout: gitLog } = await execFileAsync('git', ['log', '--oneline'], { cwd: repoPath });
    expect(gitLog).toContain('squad(t1): Create initial feature');
    expect(gitLog).toContain('squad(fix-1): Fix Feature');

    store.close();
  });
});
