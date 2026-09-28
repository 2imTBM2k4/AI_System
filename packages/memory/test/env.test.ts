import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const CLI_PATH = path.resolve(__dirname, '../dist/cli.js');

function execCli(
  args: string[],
  options: {
    stdin?: string;
    env?: NodeJS.ProcessEnv;
  }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (data) => {
      stdout += data;
    });

    child.stderr.on('data', (data) => {
      stderr += data;
    });

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin, 'utf8');
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    child.on('close', (code) => {
      resolve({
        code: code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('Task T7.1: Environment Variable Defaults & Role Enforcement', () => {
  let memoryDir: string;

  beforeEach(() => {
    memoryDir = mkdtempSync(path.join(tmpdir(), 'squad-mem-env-test-'));
  });

  afterEach(() => {
    if (existsSync(memoryDir)) {
      rmSync(memoryDir, { recursive: true, force: true });
    }
  });

  it('runs full session using purely environment variables without manual flags', async () => {
    const env = {
      SQUAD_MEMORY_DIR: memoryDir,
      SQUAD_RUN_ID: 'run-env-001',
      SQUAD_ROLE: 'backend',
    };

    // 1. squad-mem start (no --task, no --role)
    const startRes = await execCli(['start'], { env });
    expect(startRes.code).toBe(0);

    // 2. squad-mem append roles/backend.md (no --by)
    const appendRes = await execCli(['append', 'roles/backend.md', 'Learned SQLite lock rules'], { env });
    expect(appendRes.code).toBe(0);

    // 3. squad-mem end (no --task, no --role)
    const endRes = await execCli(
      ['end', '--done', 'Completed backend core', '--remaining', 'None'],
      { env }
    );
    expect(endRes.code).toBe(0);

    // Check files exist in SQUAD_MEMORY_DIR
    expect(existsSync(path.join(memoryDir, 'roles', 'backend.md'))).toBe(true);
    expect(existsSync(path.join(memoryDir, 'tasks', 'run-env-001.md'))).toBe(true);

    const taskContent = readFileSync(path.join(memoryDir, 'tasks', 'run-env-001.md'), 'utf8');
    expect(taskContent).toContain('Completed backend core');
  });

  it('allows explicit --task to override SQUAD_RUN_ID, and permits matching --by and --role', async () => {
    const env = {
      SQUAD_MEMORY_DIR: memoryDir,
      SQUAD_RUN_ID: 'run-from-env',
      SQUAD_ROLE: 'backend',
    };

    // Explicit --task overrides env SQUAD_RUN_ID
    const startRes = await execCli(
      ['start', '--task', 'run-override-task', '--role', 'backend'],
      { env }
    );
    expect(startRes.code).toBe(0);

    const appendRes = await execCli(
      ['append', 'roles/backend.md', 'Explicit matching by', '--by', 'backend'],
      { env }
    );
    expect(appendRes.code).toBe(0);

    const endRes = await execCli(
      ['end', '--task', 'run-override-task', '--role', 'backend', '--done', 'Override done', '--remaining', 'None'],
      { env }
    );
    expect(endRes.code).toBe(0);

    // Target file is run-override-task.md, NOT run-from-env.md
    expect(existsSync(path.join(memoryDir, 'tasks', 'run-override-task.md'))).toBe(true);
    expect(existsSync(path.join(memoryDir, 'tasks', 'run-from-env.md'))).toBe(false);
  });

  it('rejects mismatched --by (append/write) and --role (start/end) when SQUAD_ROLE is set', async () => {
    const env = {
      SQUAD_MEMORY_DIR: memoryDir,
      SQUAD_RUN_ID: 'run-env-002',
      SQUAD_ROLE: 'backend',
    };

    // 1. append with mismatched --by pm
    const appendRes = await execCli(
      ['append', 'roles/pm.md', 'Intruder note', '--by', 'pm'],
      { env }
    );
    expect(appendRes.code).toBe(1);
    expect(appendRes.stderr).toContain('Permission denied: provided --by "pm" does not match environment SQUAD_ROLE "backend".');
    expect(existsSync(path.join(memoryDir, 'roles', 'pm.md'))).toBe(false);

    // 2. write with mismatched --by pm
    const writeRes = await execCli(
      ['write', 'roles/pm.md', '--stdin', '--by', 'pm'],
      { env, stdin: '---\nname: pm\ndescription: d\nscope: role\nupdatedAt: "2026-09-28T00:00:00.000Z"\nupdatedBy: pm\n---\n- test' }
    );
    expect(writeRes.code).toBe(1);
    expect(writeRes.stderr).toContain('Permission denied: provided --by "pm" does not match environment SQUAD_ROLE "backend".');

    // 3. start with mismatched --role pm
    const startRes = await execCli(['start', '--role', 'pm'], { env });
    expect(startRes.code).toBe(1);
    expect(startRes.stderr).toContain('Permission denied: provided --role "pm" does not match environment SQUAD_ROLE "backend".');

    // 4. end with mismatched --role pm
    const endRes = await execCli(
      ['end', '--role', 'pm', '--done', 'done', '--remaining', 'rem'],
      { env }
    );
    expect(endRes.code).toBe(1);
    expect(endRes.stderr).toContain('Permission denied: provided --role "pm" does not match environment SQUAD_ROLE "backend".');
  });

  it('fails with missing argument error when neither env nor flags are provided', async () => {
    // Clear SQUAD_RUN_ID and SQUAD_ROLE
    const env = {
      SQUAD_MEMORY_DIR: memoryDir,
      SQUAD_RUN_ID: '',
      SQUAD_ROLE: '',
    };

    const startRes = await execCli(['start'], { env });
    expect(startRes.code).toBe(1);
    expect(startRes.stderr).toMatch(/Missing required argument/);

    const appendRes = await execCli(['append', 'roles/pm.md', 'note'], { env });
    expect(appendRes.code).toBe(1);
    expect(appendRes.stderr).toMatch(/Missing required argument/);

    const endRes = await execCli(['end', '--done', 'd', '--remaining', 'r'], { env });
    expect(endRes.code).toBe(1);
    expect(endRes.stderr).toMatch(/Missing required argument/);
  });

  it('rejects invalid env identifiers and names the specific environment variable', async () => {
    const invalidCases = [
      { varName: 'SQUAD_ROLE', val: '../traversal' },
      { varName: 'SQUAD_ROLE', val: 'CON' },
      { varName: 'SQUAD_ROLE', val: 'a:b' },
      { varName: 'SQUAD_ROLE', val: 'A'.repeat(65) },
      { varName: 'SQUAD_RUN_ID', val: '../traversal' },
      { varName: 'SQUAD_RUN_ID', val: 'NUL' },
      { varName: 'SQUAD_RUN_ID', val: 'run:123' },
      { varName: 'SQUAD_RUN_ID', val: 'R'.repeat(65) },
    ];

    for (const { varName, val } of invalidCases) {
      const env: Record<string, string> = {
        SQUAD_MEMORY_DIR: memoryDir,
        SQUAD_ROLE: 'backend',
        SQUAD_RUN_ID: 'run-valid',
        [varName]: val,
      };

      const res = await execCli(['start'], { env });
      expect(res.code).toBe(1);
      expect(res.stderr).toContain(`Environment variable ${varName}`);
    }
  });

  it('treats empty or whitespace-only SQUAD_RUN_ID and SQUAD_ROLE as unset', async () => {
    const env = {
      SQUAD_MEMORY_DIR: memoryDir,
      SQUAD_RUN_ID: '   ',
      SQUAD_ROLE: '',
    };

    // When unset, explicit flags must work without error
    const res = await execCli(['start', '--task', 'task-ok', '--role', 'qa'], { env });
    expect(res.code).toBe(0);

    const appendRes = await execCli(
      ['append', 'roles/qa.md', 'QA fact', '--by', 'qa'],
      { env }
    );
    expect(appendRes.code).toBe(0);
  });

  it('rejects relative SQUAD_MEMORY_DIR and accepts absolute path with spaces and Vietnamese characters', async () => {
    // 1. Relative SQUAD_MEMORY_DIR
    const relRes = await execCli(['read', 'index.md'], {
      env: { SQUAD_MEMORY_DIR: './relative/path' },
    });
    expect(relRes.code).toBe(1);
    expect(relRes.stderr).toContain('Environment variable SQUAD_MEMORY_DIR must be an absolute path');
    expect(relRes.stderr).toContain('differ across worktrees');

    // 2. Absolute SQUAD_MEMORY_DIR with spaces and Vietnamese characters
    const viDir = path.join(tmpdir(), 'bộ nhớ squad tiếng việt 2026 🇻🇳');
    try {
      const okRes = await execCli(
        ['append', 'decisions/utf8.md', 'Ghi chú thử nghiệm thư mục tiếng Việt', '--by', 'pm'],
        {
          env: {
            SQUAD_MEMORY_DIR: viDir,
            SQUAD_ROLE: 'pm',
          },
        }
      );
      expect(okRes.code).toBe(0);
      expect(existsSync(path.join(viDir, 'decisions', 'utf8.md'))).toBe(true);

      const readRes = await execCli(['read', 'decisions/utf8.md'], {
        env: { SQUAD_MEMORY_DIR: viDir },
      });
      expect(readRes.code).toBe(0);
      expect(readRes.stdout).toContain('Ghi chú thử nghiệm thư mục tiếng Việt');
    } finally {
      if (existsSync(viDir)) {
        rmSync(viDir, { recursive: true, force: true });
      }
    }
  });

  it('supports two processes with different SQUAD_ROLE and same SQUAD_RUN_ID appending concurrently with unique line verification', async () => {
    const runId = 'run-parallel-sync-99';
    const linesPerWorker = 20;

    const worker1Env = {
      SQUAD_MEMORY_DIR: memoryDir,
      SQUAD_RUN_ID: runId,
      SQUAD_ROLE: 'backend',
    };

    const worker2Env = {
      SQUAD_MEMORY_DIR: memoryDir,
      SQUAD_RUN_ID: runId,
      SQUAD_ROLE: 'frontend',
    };

    const runWorker = async (workerId: 1 | 2, env: Record<string, string>) => {
      for (let i = 1; i <= linesPerWorker; i++) {
        // Each worker appends to its own role
        const roleRes = await execCli(['append', `roles/${env.SQUAD_ROLE}.md`, `p${workerId}-role-note-${i}`], { env });
        if (roleRes.code !== 0) throw new Error(`Worker ${workerId} role append failed: ${roleRes.stderr}`);

        // Both workers concurrently append to the shared task file tasks/<runId>.md
        const taskRes = await execCli(['append', `tasks/${runId}.md`, `p${workerId}-line-${i}`], { env });
        if (taskRes.code !== 0) throw new Error(`Worker ${workerId} task append failed: ${taskRes.stderr}`);
      }
    };

    // Run both workers concurrently
    await Promise.all([runWorker(1, worker1Env), runWorker(2, worker2Env)]);

    // Verify tasks/<runId>.md contains all unique lines without loss
    const taskDocContent = readFileSync(path.join(memoryDir, 'tasks', `${runId}.md`), 'utf8');
    const expectedLines = new Set<string>();
    for (let i = 1; i <= linesPerWorker; i++) {
      expectedLines.add(`- p1-line-${i}`);
      expectedLines.add(`- p2-line-${i}`);
    }

    const taskLines = taskDocContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- p'));

    expect(taskLines.length).toBe(linesPerWorker * 2);

    const actualLinesSet = new Set(taskLines);
    for (const expected of expectedLines) {
      expect(actualLinesSet.has(expected)).toBe(true);
    }

    // Verify roles files are separate and only contain their respective worker's notes
    const backendContent = readFileSync(path.join(memoryDir, 'roles', 'backend.md'), 'utf8');
    expect(backendContent).toContain('- p1-role-note-1');
    expect(backendContent).not.toContain('p2-');

    const frontendContent = readFileSync(path.join(memoryDir, 'roles', 'frontend.md'), 'utf8');
    expect(frontendContent).toContain('- p2-role-note-1');
    expect(frontendContent).not.toContain('p1-');
  }, 30000);
});
