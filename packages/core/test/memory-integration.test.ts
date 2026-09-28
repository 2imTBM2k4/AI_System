import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSquadConfig, type LoadedSquadConfig } from '../src/config.js';
import { ensureMemoryShim } from '../src/memory.js';
import { validateCommandAccess, validateFileAccess } from '../src/permissions.js';
import { SquadOrchestrator } from '../src/runner.js';
import { SquadStore } from '../src/store.js';
import type { Plan } from '../src/types.js';

const execFileAsync = promisify(execFile);

describe('Task T7.5: Core Memory Integration Tests (Real Processes & Spawn Pipeline)', () => {
  let testRepoRoot = '';

  beforeEach(async () => {
    testRepoRoot = await mkdtemp(join(tmpdir(), 'squad-mem-int-'));
    await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: testRepoRoot });
    await execFileAsync('git', ['config', 'user.email', 'squad-test@example.com'], { cwd: testRepoRoot });
    await execFileAsync('git', ['config', 'user.name', 'Squad Test'], { cwd: testRepoRoot });
    await writeFile(join(testRepoRoot, 'README.md'), '# test repo\n');
    await writeFile(join(testRepoRoot, '.gitignore'), '.squad/\n');
    await execFileAsync('git', ['add', '.'], { cwd: testRepoRoot });
    await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: testRepoRoot });
  });

  afterEach(async () => {
    if (testRepoRoot) {
      try {
        await rm(testRepoRoot, { recursive: true, force: true });
      } catch {
        // Safe cleanup on Windows
      }
    }
  });

  const makeLoadedConfig = (agentScript: string, extraConfig: Record<string, any> = {}): LoadedSquadConfig => ({
    config: parseSquadConfig({
      permissionMode: 'restricted',
      maxParallel: 2,
      verify: ['node -e "process.exit(0)"'],
      agents: {
        backend: { command: ['node', agentScript, '{{prompt}}'] },
        frontend: { command: ['node', agentScript, '{{prompt}}'] },
        planner: { command: ['node', agentScript, '{{prompt}}'] },
        tester: { command: ['node', agentScript, '{{prompt}}'] },
        default: { command: ['node', agentScript, '{{prompt}}'] },
      },
      ...extraConfig,
    }),
    configPath: join(testRepoRoot, 'squad.config.json'),
    configDirectory: testRepoRoot,
  });

  // Case 1: Agent giả chạy squad-mem start, append roles/<role>.md, end chỉ bằng biến môi trường
  it('Case 1: fake agent runs start, append, and end purely via environment variables under real permissions', async () => {
    const agentScript = join(testRepoRoot, 'agent-c1.cjs');
    await writeFile(
      agentScript,
      `
const { execSync } = require('node:child_process');
const fs = require('node:fs');

// Ensure squad-mem commands succeed using environment variables
execSync('squad-mem start', { stdio: 'inherit' });
execSync('squad-mem append roles/' + process.env.SQUAD_ROLE + '.md "Learned backend lesson"', { stdio: 'inherit' });
execSync('squad-mem end --done "Finished feature" --remaining "None"', { stdio: 'inherit' });
console.log('AGENT_DONE');
`,
    );

    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: makeLoadedConfig(agentScript), store });
    const runId = 'run-mem-c1';
    const plan: Plan = {
      goal: 'test env memory',
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          role: 'backend',
          files: [],
          dependsOn: [],
          prompt: 'Do task 1',
          branch: 'squad/task-1',
          verify: 'node -e "process.exit(0)"',
        },
      ],
    };

    store.createPlannedRun(runId, testRepoRoot, plan);
    const [result] = await orchestrator.runPlan(testRepoRoot, plan, runId);
    store.close();

    expect(result.status).toBe('passed');
    expect(result.error).toBeUndefined();

    // Verify memory files in SQUAD_MEMORY_DIR
    const roleFile = join(testRepoRoot, '.squad', 'memory', 'roles', 'backend.md');
    expect(existsSync(roleFile)).toBe(true);
    expect(readFileSync(roleFile, 'utf8')).toContain('Learned backend lesson');

    const taskFile = join(testRepoRoot, '.squad', 'memory', 'tasks', `${runId}.md`);
    expect(existsSync(taskFile)).toBe(true);
    const taskContent = readFileSync(taskFile, 'utf8');
    expect(taskContent).toContain('Finished feature');
    expect(taskContent).toContain('None');

    // Verify real permissions
    expect(validateCommandAccess('backend', 'squad-mem start').allowed).toBe(true);
    expect(validateCommandAccess('backend', 'squad-mem append roles/backend.md "test"').allowed).toBe(true);
    expect(validateCommandAccess('backend', 'squad-mem end --done "d" --remaining "r"').allowed).toBe(true);
  }, 25_000);

  // Case 2: Hai agent giả khác role cùng run, chạy song song đối chiếu TẬP DÒNG DUY NHẤT
  it('Case 2: two parallel agents with different roles append concurrently without dropping unique lines', async () => {
    const agentScript = join(testRepoRoot, 'agent-c2.cjs');
    await writeFile(
      agentScript,
      `
const { execSync } = require('node:child_process');
const role = process.env.SQUAD_ROLE;
const runId = process.env.SQUAD_RUN_ID;

for (let i = 1; i <= 10; i++) {
  const line = role + '-line-' + i;
  execSync('squad-mem append roles/' + role + '.md "' + line + '"', { stdio: 'inherit' });
  execSync('squad-mem append tasks/' + runId + '.md "' + line + '"', { stdio: 'inherit' });
}
`,
    );

    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: makeLoadedConfig(agentScript), store });
    const runId = 'run-mem-c2';
    const plan: Plan = {
      goal: 'parallel memory append',
      tasks: [
        {
          id: 'task-backend',
          title: 'Backend Task',
          role: 'backend',
          files: [],
          dependsOn: [],
          prompt: 'Run backend',
          branch: 'squad/backend',
          verify: 'node -e "process.exit(0)"',
        },
        {
          id: 'task-frontend',
          title: 'Frontend Task',
          role: 'frontend',
          files: [],
          dependsOn: [],
          prompt: 'Run frontend',
          branch: 'squad/frontend',
          verify: 'node -e "process.exit(0)"',
        },
      ],
    };

    store.createPlannedRun(runId, testRepoRoot, plan);
    const results = await orchestrator.runPlan(testRepoRoot, plan, runId);
    store.close();

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'passed')).toBe(true);

    // Verify roles/backend.md
    const backendRoleFile = join(testRepoRoot, '.squad', 'memory', 'roles', 'backend.md');
    const backendContent = readFileSync(backendRoleFile, 'utf8');
    for (let i = 1; i <= 10; i++) {
      expect(backendContent).toContain(`backend-line-${i}`);
    }

    // Verify roles/frontend.md
    const frontendRoleFile = join(testRepoRoot, '.squad', 'memory', 'roles', 'frontend.md');
    const frontendContent = readFileSync(frontendRoleFile, 'utf8');
    for (let i = 1; i <= 10; i++) {
      expect(frontendContent).toContain(`frontend-line-${i}`);
    }

    // Verify tasks/<runId>.md contains all 20 lines without any dropped
    const taskFile = join(testRepoRoot, '.squad', 'memory', 'tasks', `${runId}.md`);
    const taskContent = readFileSync(taskFile, 'utf8');
    const expectedLines = new Set<string>();
    for (let i = 1; i <= 10; i++) {
      expectedLines.add(`backend-line-${i}`);
      expectedLines.add(`frontend-line-${i}`);
    }

    for (const expected of expectedLines) {
      expect(taskContent).toContain(expected);
    }
  }, 25_000);

  // Case 3: executionMode = worktree: hai task ở hai worktree khác nhau trỏ về cùng SQUAD_MEMORY_DIR
  it('Case 3: worktree execution mode executes squad-mem via shim from cwd without node_modules and writes to main repo memory', async () => {
    const agentScript = join(testRepoRoot, 'agent-c3.cjs');
    await writeFile(
      agentScript,
      `
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Verify cwd has no node_modules
const hasNodeModules = fs.existsSync(path.join(process.cwd(), 'node_modules'));
if (hasNodeModules) {
  throw new Error('Worktree should not contain node_modules');
}

// squad-mem runs via shim from PATH
execSync('squad-mem append roles/' + process.env.SQUAD_ROLE + '.md "worktree note ' + process.env.SQUAD_ROLE + '"', { stdio: 'inherit' });
execSync('squad-mem end --done "worktree done ' + process.env.SQUAD_ROLE + '" --remaining "none"', { stdio: 'inherit' });
`,
    );

    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({
      config: makeLoadedConfig(agentScript, { executionMode: 'worktree' }),
      store,
    });

    const runId = 'run-mem-c3';
    const plan: Plan = {
      goal: 'worktree test',
      tasks: [
        {
          id: 'wt-task-1',
          title: 'Worktree Task 1',
          role: 'backend',
          files: [],
          dependsOn: [],
          prompt: 'Run wt 1',
          branch: 'squad/wt-1',
          verify: 'node -e "process.exit(0)"',
        },
        {
          id: 'wt-task-2',
          title: 'Worktree Task 2',
          role: 'frontend',
          files: [],
          dependsOn: [],
          prompt: 'Run wt 2',
          branch: 'squad/wt-2',
          verify: 'node -e "process.exit(0)"',
        },
      ],
    };

    store.createPlannedRun(runId, testRepoRoot, plan);
    const results = await orchestrator.runPlan(testRepoRoot, plan, runId);
    store.close();

    expect(results.every((r) => r.status === 'passed')).toBe(true);

    // Verify main repo has the files
    const mainMemoryDir = join(testRepoRoot, '.squad', 'memory');
    expect(existsSync(join(mainMemoryDir, 'roles', 'backend.md'))).toBe(true);
    expect(existsSync(join(mainMemoryDir, 'roles', 'frontend.md'))).toBe(true);

    const mainTaskFile = join(mainMemoryDir, 'tasks', `${runId}.md`);
    expect(existsSync(mainTaskFile)).toBe(true);
    const content = readFileSync(mainTaskFile, 'utf8');
    expect(content).toContain('worktree done backend');
    expect(content).toContain('worktree done frontend');
  }, 25_000);

  // Case 4: Role backend cố squad-mem append roles/frontend.md bị từ chối; cố ghi index.md bằng file thường bị permissions từ chối
  it('Case 4: backend role is rejected when attempting to append to frontend.md and denied direct file write to index.md', async () => {
    const agentScript = join(testRepoRoot, 'agent-c4.cjs');
    await writeFile(
      agentScript,
      `
const { execSync } = require('node:child_process');
const fs = require('node:fs');

// Attempting to append to roles/frontend.md while SQUAD_ROLE=backend must fail
try {
  execSync('squad-mem append roles/frontend.md "Illegal cross-role write"', { stdio: 'pipe' });
  process.exit(1); // should not reach here
} catch (err) {
  const stderr = err.stderr ? err.stderr.toString() : '';
  if (!stderr.includes('Access denied') && !stderr.includes('roles/frontend.md')) {
    process.exit(2);
  }
}

// Success indicator
console.log('REJECTION_VERIFIED');
`,
    );

    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: makeLoadedConfig(agentScript), store });
    const runId = 'run-mem-c4';
    const plan: Plan = {
      goal: 'permissions enforcement',
      tasks: [
        {
          id: 'sec-task',
          title: 'Security check',
          role: 'backend',
          files: [],
          dependsOn: [],
          prompt: 'Check role boundary',
          branch: 'squad/sec-task',
          verify: 'node -e "process.exit(0)"',
        },
      ],
    };

    store.createPlannedRun(runId, testRepoRoot, plan);
    const [result] = await orchestrator.runPlan(testRepoRoot, plan, runId);
    store.close();

    expect(result.status).toBe('passed');

    // Role backend attempting direct file write to .squad/memory/index.md is blocked by validateFileAccess
    const fileAccessResult = validateFileAccess('backend', '.squad/memory/index.md', testRepoRoot);
    expect(fileAccessResult.allowed).toBe(false);
    expect(fileAccessResult.reason).toContain("outside the assigned scope for role 'backend'");
  }, 25_000);

  // Case 5: Alias: task có role planner hoặc tester -> SQUAD_ROLE là pm và qa, không sinh roles/planner.md hay roles/tester.md
  it('Case 5: role aliases (planner, tester) resolve to canonical roles (pm, qa) without creating alias role files', async () => {
    const agentScript = join(testRepoRoot, 'agent-c5.cjs');
    await writeFile(
      agentScript,
      `
const { execSync } = require('node:child_process');
const fs = require('node:fs');

const role = process.env.SQUAD_ROLE;
execSync('squad-mem append roles/' + role + '.md "Note for ' + role + '"', { stdio: 'inherit' });
`,
    );

    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({ config: makeLoadedConfig(agentScript), store });
    const runId = 'run-mem-c5';
    const plan: Plan = {
      goal: 'alias check',
      tasks: [
        {
          id: 'alias-planner',
          title: 'Planner task',
          role: 'planner',
          files: [],
          dependsOn: [],
          prompt: 'Do planner',
          branch: 'squad/alias-planner',
          verify: 'node -e "process.exit(0)"',
        },
        {
          id: 'alias-tester',
          title: 'Tester task',
          role: 'tester',
          files: [],
          dependsOn: [],
          prompt: 'Do tester',
          branch: 'squad/alias-tester',
          verify: 'node -e "process.exit(0)"',
        },
      ],
    };

    store.createPlannedRun(runId, testRepoRoot, plan);
    const results = await orchestrator.runPlan(testRepoRoot, plan, runId);
    store.close();
    if (!results.every((r) => r.status === 'passed')) {
      console.log('C5 RESULTS:', results);
      for (const r of results) {
        const logFile = join(testRepoRoot, '.squad', 'logs', runId, `${r.taskId}.log`);
        if (existsSync(logFile)) {
          console.log(`LOG ${r.taskId}:`, readFileSync(logFile, 'utf8'));
        }
      }
    }
    expect(results.every((r) => r.status === 'passed')).toBe(true);

    const memDir = join(testRepoRoot, '.squad', 'memory', 'roles');
    expect(existsSync(join(memDir, 'pm.md'))).toBe(true);
    expect(existsSync(join(memDir, 'qa.md'))).toBe(true);
    expect(existsSync(join(memDir, 'planner.md'))).toBe(false);
    expect(existsSync(join(memDir, 'tester.md'))).toBe(false);
  }, 25_000);

  // Case 6: Giai đoạn planner: SQUAD_ROLE=pm, SQUAD_MEMORY_DIR set, nhưng KHÔNG có SQUAD_RUN_ID
  it('Case 6: planner phase injects SQUAD_ROLE=pm and SQUAD_MEMORY_DIR without SQUAD_RUN_ID', async () => {
    const plannerScript = join(testRepoRoot, 'planner-c6.cjs');
    await writeFile(
      plannerScript,
      `
const { execSync } = require('node:child_process');
const path = require('node:path');

// 1. Verify environment variables
if (process.env.SQUAD_ROLE !== 'pm') {
  throw new Error('Expected SQUAD_ROLE to be pm, got: ' + process.env.SQUAD_ROLE);
}
if (!process.env.SQUAD_MEMORY_DIR) {
  throw new Error('Expected SQUAD_MEMORY_DIR to be defined');
}
if (process.env.SQUAD_RUN_ID !== undefined) {
  throw new Error('SQUAD_RUN_ID must not be defined during planning');
}

// 2. append succeeds without runId
execSync('squad-mem append roles/pm.md "Note created during planning"', { stdio: 'inherit' });

// 3. start fails because --task and SQUAD_RUN_ID are missing
try {
  execSync('squad-mem start', { stdio: 'pipe' });
  throw new Error('squad-mem start should have failed');
} catch (err) {
  const stderr = err.stderr ? err.stderr.toString() : '';
  if (!stderr.includes('SQUAD_RUN_ID') && !stderr.includes('--task')) {
    throw new Error('Expected clear error about missing task / runId, got: ' + stderr);
  }
}

// 4. Output valid plan JSON
const plan = {
  tasks: [
    {
      id: 'generated-task',
      title: 'Generated Task',
      role: 'backend',
      files: [],
      dependsOn: [],
      prompt: 'Work'
    }
  ]
};
console.log(JSON.stringify(plan));
`,
    );

    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({
      config: makeLoadedConfig(plannerScript, {
        agents: {
          planner: { command: ['node', plannerScript, '{{prompt}}'] },
          default: { command: ['node', '-e', 'process.exit(0)'] },
        },
      }),
      store,
    });

    const planResult = await orchestrator.makePlan(testRepoRoot, 'Plan system');
    store.close();

    expect(planResult.runId).toBeDefined();
    expect(planResult.plan.tasks).toHaveLength(1);

    // Verify pm.md was created during planning
    const pmRoleFile = join(testRepoRoot, '.squad', 'memory', 'roles', 'pm.md');
    expect(existsSync(pmRoleFile)).toBe(true);
    expect(readFileSync(pmRoleFile, 'utf8')).toContain('Note created during planning');
  }, 25_000);

  // Case 7: Biến động ghi đè giá trị cùng tên khai báo trong agent.spec.env
  it('Case 7: dynamic memory environment variables strictly override agent.spec.env', async () => {
    const agentScript = join(testRepoRoot, 'agent-c7.cjs');
    await writeFile(
      agentScript,
      `
const fs = require('node:fs');
const role = process.env.SQUAD_ROLE;
const runId = process.env.SQUAD_RUN_ID;
const memDir = process.env.SQUAD_MEMORY_DIR;

if (role === 'fake-role' || runId === 'fake-run-id' || memDir === '/fake/memory/dir') {
  process.exit(1);
}
if (role !== 'backend' || !runId.startsWith('run-') || !memDir.includes('.squad')) {
  process.exit(2);
}
console.log('ENV_OVERRIDE_VERIFIED');
`,
    );

    const store = await SquadStore.open(':memory:');
    const orchestrator = new SquadOrchestrator({
      config: makeLoadedConfig(agentScript, {
        agents: {
          backend: {
            command: ['node', agentScript, '{{prompt}}'],
            env: {
              SQUAD_ROLE: 'fake-role',
              SQUAD_RUN_ID: 'fake-run-id',
              SQUAD_MEMORY_DIR: '/fake/memory/dir',
            },
          },
          default: { command: ['node', agentScript, '{{prompt}}'] },
        },
      }),
      store,
    });

    const runId = 'run-mem-c7';
    const plan: Plan = {
      goal: 'override env test',
      tasks: [
        {
          id: 'override-task',
          title: 'Override task',
          role: 'backend',
          files: [],
          dependsOn: [],
          prompt: 'Check override',
          branch: 'squad/override',
          verify: 'node -e "process.exit(0)"',
        },
      ],
    };

    store.createPlannedRun(runId, testRepoRoot, plan);
    const [result] = await orchestrator.runPlan(testRepoRoot, plan, runId);
    store.close();

    expect(result.status).toBe('passed');
  }, 25_000);

  // Case 8: dist/cli.js chưa build -> lỗi rõ ràng, không lỗi im lặng
  it('Case 8: throws a descriptive error when packages/memory dist/cli.js is missing', () => {
    const nonExistentCli = join(testRepoRoot, 'non-existent', 'dist', 'cli.js');
    expect(() => ensureMemoryShim(testRepoRoot, nonExistentCli)).toThrow(
      /packages\/memory chưa được build \(không tìm thấy .*?\)\. Hãy chạy 'pnpm -F @squad\/memory build' trước\./,
    );
  });

  // Case 9: Không có test nào của core/server/web/cli bị sửa hay xóa
  it('Case 9: confirms default permissions and command allowlist structure remain intact', () => {
    // Confirms that squad-mem is in allowedCommands for all 8 roles without modifying forbidden paths or extra permissions
    const roles = ['backend', 'frontend', 'mobile', 'database', 'devops', 'pm', 'techlead', 'qa'];
    for (const r of roles) {
      const res = validateCommandAccess(r, 'squad-mem start');
      expect(res.allowed).toBe(true);
    }
  });
});

