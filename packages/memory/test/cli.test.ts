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

    // 2. Append into role note
    const appRes2 = await execCli(
      ['append', 'roles/tester.md', 'Testing Fact: Concurrency needs real processes', '--by', 'qa-agent'],
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
});
