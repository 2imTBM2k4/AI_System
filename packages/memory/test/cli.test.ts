import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const CLI_PATH = path.resolve(__dirname, '../dist/cli.js');

function execCli(
  args: string[],
  options: {
    stdin?: string;
    memoryDir: string;
  }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      env: {
        ...process.env,
        SQUAD_MEMORY_DIR: options.memoryDir,
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

describe('CLI squad-mem (T5)', () => {
  let memoryDir: string;

  beforeEach(() => {
    memoryDir = mkdtempSync(path.join(tmpdir(), 'squad-mem-cli-test-'));
  });

  afterEach(() => {
    if (existsSync(memoryDir)) {
      rmSync(memoryDir, { recursive: true, force: true });
    }
  });

  it('fails with exit code != 0 and prints error to stderr when reading non-existent file', async () => {
    const res = await execCli(['read', 'non-existent.md'], { memoryDir });

    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain('Memory file not found: non-existent.md');
    expect(res.stdout).toBe('');
  });

  it('fails with clear error message when append is called without --by', async () => {
    const res = await execCli(['append', 'tasks/test.md', 'Some fact'], { memoryDir });

    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("error: required option '--by <agent>' not specified");
  });

  it('writes and reads Vietnamese UTF-8 content via write --stdin', async () => {
    const docWithVietnamese = `---
name: quy-uoc-du-an
description: Quy ước quan trọng của dự án 🇻🇳
scope: project
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: architect
---
- Quy ước 1: Luôn kiểm thử hành vi thực tế 🚀
- Quy ước 2: Tránh giả định khi thiếu thông tin 🛡️
`;

    // 1. Write via stdin
    const writeRes = await execCli(['write', 'decisions/quy-uoc.md', '--stdin'], {
      memoryDir,
      stdin: docWithVietnamese,
    });
    expect(writeRes.code).toBe(0);

    // 2. Read back via CLI stdout
    const readRes = await execCli(['read', 'decisions/quy-uoc.md'], { memoryDir });
    expect(readRes.code).toBe(0);
    expect(readRes.stdout).toContain('Quy ước quan trọng của dự án');
    expect(readRes.stdout).toContain('Luôn kiểm thử hành vi thực tế 🚀');
    expect(readRes.stdout).toContain('Tránh giả định khi thiếu thông tin 🛡️');
  });

  it('supports full lifecycle via CLI: append, list, search, start, end', async () => {
    // 1. Append into index.md
    const appRes1 = await execCli(
      ['append', 'index.md', 'Project Overview Fact', '--by', 'lead-agent', '--scope', 'project'],
      { memoryDir }
    );
    expect(appRes1.code).toBe(0);

    // 2. Append into role note (matching role per Decision)
    const appRes2 = await execCli(
      ['append', 'roles/tester.md', 'Testing Fact: Concurrency needs real processes', '--by', 'tester'],
      { memoryDir }
    );
    expect(appRes2.code).toBe(0);

    // 3. List command
    const listRes = await execCli(['list'], { memoryDir });
    expect(listRes.code).toBe(0);
    expect(listRes.stdout).toContain('index.md');
    expect(listRes.stdout).toContain('roles/tester.md');

    // 4. Search command
    const searchRes = await execCli(['search', 'concurrency'], { memoryDir });
    expect(searchRes.code).toBe(0);
    expect(searchRes.stdout).toContain('roles/tester.md:');
    expect(searchRes.stdout).toContain('Concurrency needs real processes');

    // 5. Start session command
    const startRes = await execCli(['start', '--task', 'task-xyz', '--role', 'tester'], { memoryDir });
    expect(startRes.code).toBe(0);
    expect(startRes.stdout).toContain('## Project Conventions (index.md)');
    expect(startRes.stdout).toContain('## Role Notes: tester (roles/tester.md)');

    // 6. End session command
    const endRes = await execCli(
      [
        'end',
        '--task', 'task-xyz',
        '--role', 'tester',
        '--done', 'Wrote unit and integration tests',
        '--remaining', 'Deploy to staging',
      ],
      { memoryDir }
    );
    expect(endRes.code).toBe(0);

    // Verify task state was recorded
    const readTask = await execCli(['read', 'tasks/task-xyz.md'], { memoryDir });
    expect(readTask.code).toBe(0);
    expect(readTask.stdout).toContain('Wrote unit and integration tests');
    expect(readTask.stdout).toContain('Deploy to staging');
  });

  it('rejects non-integer --max-chars (e.g. abc) with non-zero exit code and error message', async () => {
    const res = await execCli(
      ['start', '--task', 'task-val', '--role', 'tester', '--max-chars', 'abc'],
      { memoryDir }
    );

    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain('--max-chars must be a positive integer');
  });

  it('exits with non-zero code and logs error when a file lock cannot be acquired (lock timeout)', async () => {
    const target = 'decisions/lock-cli-timeout.md';
    const lockPath = path.join(memoryDir, `${target}.lock`);
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(path.dirname(lockPath), { recursive: true });

    // Create an active fresh lock
    const payload = {
      pid: process.pid,
      acquiredAt: Date.now(),
      filePath: path.join(memoryDir, target),
    };
    writeFileSync(lockPath, JSON.stringify(payload), 'utf8');

    try {
      const res = await execCli(
        ['append', target, 'Fact while locked', '--by', 'agent'],
        { memoryDir }
      );

      // Must fail with non-zero exit code
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/(Timed out acquiring lock|Error appending memory)/);
    } finally {
      const { rmSync } = await import('node:fs');
      rmSync(lockPath, { force: true });
    }
  }, 15000);

  it('supports real PowerShell piping with UTF-8 Vietnamese characters into write --stdin', async () => {
    if (process.platform !== 'win32') return;

    const psScript = `
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$doc = @"
---
name: pwsh-test
description: Tiếng Việt có dấu từ PowerShell 🇻🇳
scope: project
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: powershell-agent
---
- Thực thi đường ống PowerShell thành công 🚀
- Bảo đảm toàn vẹn mã hóa UTF-8 🛡️
"@
$doc | node "${CLI_PATH.replace(/\\/g, '\\\\')}" write decisions/pwsh-test.md --stdin
`;

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const { exec } = await import('node:child_process');

    await new Promise<void>((resolve, reject) => {
      exec(
        `powershell.exe -NoProfile -EncodedCommand ${encoded}`,
        {
          env: { ...process.env, SQUAD_MEMORY_DIR: memoryDir },
          encoding: 'utf8',
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`PowerShell pipe failed: ${error.message} (stderr: ${stderr})`));
          } else {
            resolve();
          }
        }
      );
    });

    // Read back via CLI
    const readRes = await execCli(['read', 'decisions/pwsh-test.md'], { memoryDir });
    expect(readRes.code).toBe(0);
    expect(readRes.stdout).toContain('Tiếng Việt có dấu từ PowerShell');
    expect(readRes.stdout).toContain('Thực thi đường ống PowerShell thành công 🚀');
    expect(readRes.stdout).toContain('Bảo đảm toàn vẹn mã hóa UTF-8 🛡️');
  }, 15000);

  it('enforces append role permissions in CLI: allowed when --by matches role, rejected when mismatch or empty', async () => {
    // 1. Correct --by: pm appends to roles/pm.md
    const okRes = await execCli(
      ['append', 'roles/pm.md', 'Valid PM note', '--by', 'pm'],
      { memoryDir }
    );
    expect(okRes.code).toBe(0);

    // 2. Mismatched --by: dev appends to roles/pm.md
    const failRes = await execCli(
      ['append', 'roles/pm.md', 'Invalid intruder note', '--by', 'dev'],
      { memoryDir }
    );
    expect(failRes.code).not.toBe(0);
    expect(failRes.stderr).toContain("Permission denied: agent 'dev' cannot append to 'roles/pm.md'. Only role 'pm' is permitted.");

    // 3. Empty --by: rejects with clear error
    const emptyRes = await execCli(
      ['append', 'roles/pm.md', 'Empty by note', '--by', ''],
      { memoryDir }
    );
    expect(emptyRes.code).not.toBe(0);
    expect(emptyRes.stderr).toContain('--by cannot be empty');

    // 4. Tasks and decisions are NOT restricted by this rule
    const taskRes = await execCli(
      ['append', 'tasks/task-001.md', 'Task update', '--by', 'dev'],
      { memoryDir }
    );
    expect(taskRes.code).toBe(0);

    const decisionRes = await execCli(
      ['append', 'decisions/auth.md', 'Decision update', '--by', 'dev'],
      { memoryDir }
    );
    expect(decisionRes.code).toBe(0);
  });

  it('emits warning to stderr and truncates index.md in stdout when index.md alone exceeds maxChars', async () => {
    const longIndex = `---
name: index
description: Massive index document
scope: project
updatedAt: "2026-09-28T00:00:00.000Z"
updatedBy: architect
---
${'A'.repeat(500)}
`;
    await execCli(['write', 'index.md', '--stdin'], { memoryDir, stdin: longIndex });

    const maxChars = 250;
    const res = await execCli(
      ['start', '--task', 'task-100', '--role', 'architect', '--max-chars', maxChars.toString()],
      { memoryDir }
    );

    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[... Truncated index.md exceeding maxChars ...]');
    expect(res.stdout.trim().length).toBeLessThanOrEqual(maxChars);
    expect(res.stderr).toContain('Warning: index.md exceeds maxChars limit');
    expect(res.stderr).toContain(`maxChars: ${maxChars}`);
  });
});
