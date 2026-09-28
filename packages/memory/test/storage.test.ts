import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fork } from 'node:child_process';
import {
  resolveSafePath,
  atomicWrite,
  withFileLock,
  PathTraversalError,
  LockTimeoutError,
} from '../src/index.js';

describe('storage layer (T2)', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'squad-mem-storage-test-'));
  });

  afterEach(() => {
    if (existsSync(rootDir)) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  describe('resolveSafePath', () => {
    it('rejects path traversal attempts with ../../', () => {
      expect(() => resolveSafePath(rootDir, '../../etc/passwd')).toThrowError(PathTraversalError);
      expect(() => resolveSafePath(rootDir, 'nested/../../../escape')).toThrowError(PathTraversalError);
      expect(() => resolveSafePath(rootDir, '..')).toThrowError(PathTraversalError);
    });

    it('rejects absolute paths', () => {
      const absPath = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc/passwd';
      expect(() => resolveSafePath(rootDir, absPath)).toThrowError(PathTraversalError);
    });

    it('rejects symlinks that resolve outside of root', () => {
      const outsideDir = mkdtempSync(path.join(tmpdir(), 'squad-mem-outside-'));
      const symlinkPath = path.join(rootDir, 'outside_link');

      try {
        // Use junction on Windows for directories without requiring elevated privileges
        const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
        symlinkSync(outsideDir, symlinkPath, symlinkType);

        expect(() => resolveSafePath(rootDir, 'outside_link/secret.txt')).toThrowError(PathTraversalError);
      } finally {
        if (existsSync(outsideDir)) {
          rmSync(outsideDir, { recursive: true, force: true });
        }
      }
    });

    it('allows valid relative paths within root', () => {
      const safe = resolveSafePath(rootDir, 'tasks/task-123.md');
      expect(safe).toBe(path.resolve(rootDir, 'tasks/task-123.md'));
    });
  });

  describe('atomicWrite', () => {
    it('automatically creates non-existent parent directories and writes content', async () => {
      const target = path.join(rootDir, 'deeply', 'nested', 'dir', 'memory.md');
      const content = 'Hello squad memory!';

      await atomicWrite(target, content);

      expect(existsSync(target)).toBe(true);
      const read = await readFile(target, 'utf8');
      expect(read).toBe(content);
    });

    it('recovers cleanly when orphaned .tmp files are left from simulated crash', async () => {
      const target = path.join(rootDir, 'crash-test', 'file.md');
      const orphanTmp = path.join(rootDir, 'crash-test', '.file.md.orphan-crash.tmp');

      // Create directory and orphan tmp file
      await atomicWrite(target, 'Initial valid content');
      await writeFile(orphanTmp, 'Half-written broken content from crash');

      expect(existsSync(orphanTmp)).toBe(true);

      // Write new content
      const freshContent = 'Updated complete content after restart';
      await atomicWrite(target, freshContent);

      // Target must be intact with new content, no corruption
      const read = await readFile(target, 'utf8');
      expect(read).toBe(freshContent);
    });
  });

  describe('withFileLock', () => {
    it('reclaims stale lock from a dead PID process', async () => {
      const target = path.join(rootDir, 'stale-test.md');
      const lockPath = `${target}.lock`;

      // Simulate a lock file written by a non-existent dead PID
      const stalePayload = {
        pid: 99999999, // Dead PID
        acquiredAt: Date.now() - 5000,
        filePath: target,
      };
      await writeFile(lockPath, JSON.stringify(stalePayload), 'utf8');

      // Attempting to lock should detect dead PID, clear stale lock, and succeed
      let executed = false;
      await withFileLock(target, async () => {
        executed = true;
        await atomicWrite(target, 'recovered from stale lock');
      }, { timeoutMs: 3000, retryIntervalMs: 50 });

      expect(executed).toBe(true);
      expect(await readFile(target, 'utf8')).toBe('recovered from stale lock');
      expect(existsSync(lockPath)).toBe(false);
    });

    it('throws LockTimeoutError when lock is held longer than timeout', async () => {
      const target = path.join(rootDir, 'timeout-test.md');
      const lockPath = `${target}.lock`;

      // Create an active lock owned by current process, marked as fresh
      const payload = {
        pid: process.pid, // alive PID
        acquiredAt: Date.now(),
        filePath: target,
      };
      await writeFile(lockPath, JSON.stringify(payload), 'utf8');

      try {
        await expect(
          withFileLock(target, async () => {}, {
            timeoutMs: 300,
            retryIntervalMs: 50,
            staleMs: 60000, // Not stale
          })
        ).rejects.toThrowError(LockTimeoutError);
      } finally {
        // Clean up manual lock
        rmSync(lockPath, { force: true });
      }
    });

    it('handles 2 real OS processes writing to the same file concurrently without data corruption', async () => {
      const target = path.join(rootDir, 'concurrent.txt');
      const scriptPath = path.resolve(__dirname, 'fixtures/concurrent-writer.js');
      const linesPerWorker = 20;

      // Spawn two real separate OS worker processes
      const runWorker = (workerId: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          const child = fork(scriptPath, [
            '--file', target,
            '--id', workerId,
            '--count', linesPerWorker.toString(),
          ]);

          child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Worker ${workerId} exited with code ${code}`));
          });

          child.on('error', reject);
        });
      };

      // Run both processes in parallel
      await Promise.all([runWorker('1'), runWorker('2')]);

      // Verify file integrity
      expect(existsSync(target)).toBe(true);
      const content = await readFile(target, 'utf8');
      const lines = content.trim().split('\n').filter((l) => l.trim().length > 0);

      // Total lines must be exactly 2 * linesPerWorker = 40
      expect(lines.length).toBe(linesPerWorker * 2);

      // Count lines from worker 1 and worker 2
      const worker1Lines = lines.filter((l) => l.includes('[worker-1]'));
      const worker2Lines = lines.filter((l) => l.includes('[worker-2]'));

      expect(worker1Lines.length).toBe(linesPerWorker);
      expect(worker2Lines.length).toBe(linesPerWorker);

      // Ensure no corrupted lines or cutoffs
      for (let i = 1; i <= linesPerWorker; i++) {
        expect(content).toContain(`[worker-1] line ${i}`);
        expect(content).toContain(`[worker-2] line ${i}`);
      }
    }, 25000);
  });
});
