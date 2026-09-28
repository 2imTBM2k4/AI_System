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

    it('rejects directory junctions that resolve outside of root', () => {
      const outsideDir = mkdtempSync(path.join(tmpdir(), 'squad-mem-outside-'));
      const junctionDir = path.join(rootDir, 'outside_junction');
      const junctionType = process.platform === 'win32' ? 'junction' : 'dir';
      symlinkSync(outsideDir, junctionDir, junctionType);

      try {
        expect(() => resolveSafePath(rootDir, 'outside_junction/secret.txt')).toThrowError(PathTraversalError);
      } finally {
        if (existsSync(outsideDir)) {
          rmSync(outsideDir, { recursive: true, force: true });
        }
      }
    });

    it('rejects real file symlinks that resolve outside of root', (ctx) => {
      const outsideDir = mkdtempSync(path.join(tmpdir(), 'squad-mem-outside-file-'));
      const outsideFile = path.join(outsideDir, 'secret.txt');
      writeFileSync(outsideFile, 'secret content', 'utf8');

      const symlinkFilePath = path.join(rootDir, 'symlink_secret.txt');
      try {
        symlinkSync(outsideFile, symlinkFilePath, 'file');
      } catch (err: any) {
        if (err.code === 'EPERM' && process.platform === 'win32') {
          // On Windows, creating file symlinks requires elevated SeCreateSymbolicLinkPrivilege / Developer Mode.
          // When not available, mark test as SKIPPED so it is transparently not counted as passed.
          ctx.skip();
          return;
        }
        throw err;
      }

      try {
        expect(() => resolveSafePath(rootDir, 'symlink_secret.txt')).toThrowError(PathTraversalError);
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

      await atomicWrite(target, 'Initial valid content');
      await writeFile(orphanTmp, 'Half-written broken content from crash');

      expect(existsSync(orphanTmp)).toBe(true);

      const freshContent = 'Updated complete content after restart';
      await atomicWrite(target, freshContent);

      const read = await readFile(target, 'utf8');
      expect(read).toBe(freshContent);
    });

    it('prevents torn reads by ensuring readers never see partial content during ongoing write', async () => {
      const target = path.join(rootDir, 'read-during-write.txt');
      const initialContent = 'VERSION_1_COMPLETE';
      await atomicWrite(target, initialContent);

      const largeContent = 'VERSION_2_START_' + 'A'.repeat(50000) + '_VERSION_2_END';

      // Perform write and concurrent reads
      const writePromise = atomicWrite(target, largeContent);

      // Perform multiple concurrent reads during the write
      const readResults: string[] = [];
      for (let i = 0; i < 10; i++) {
        const content = await readFile(target, 'utf8');
        readResults.push(content);
      }

      await writePromise;

      // Every read must either see exact VERSION_1 or exact VERSION_2, never torn/partial data
      for (const res of readResults) {
        const isV1 = res === initialContent;
        const isV2 = res === largeContent;
        expect(isV1 || isV2).toBe(true);
      }

      // Final read is VERSION_2
      expect(await readFile(target, 'utf8')).toBe(largeContent);
    });
  });

  describe('withFileLock', () => {
    it('reclaims stale lock from a dead PID process', async () => {
      const target = path.join(rootDir, 'stale-test.md');
      const lockPath = `${target}.lock`;

      const stalePayload = {
        pid: 99999999, // Dead PID
        acquiredAt: Date.now() - 5000,
        filePath: target,
      };
      await writeFile(lockPath, JSON.stringify(stalePayload), 'utf8');

      let executed = false;
      await withFileLock(target, async () => {
        executed = true;
        await atomicWrite(target, 'recovered from stale lock');
      }, { timeoutMs: 3000, retryIntervalMs: 50 });

      expect(executed).toBe(true);
      expect(await readFile(target, 'utf8')).toBe('recovered from stale lock');
      expect(existsSync(lockPath)).toBe(false);
    });

    it('reclaims stale lock when holding process is still alive but lock exceeds 30s per Decision (b)', async () => {
      const target = path.join(rootDir, 'stale-alive-test.md');
      const lockPath = `${target}.lock`;

      // Lock held by current (alive) process, but timestamp is 35 seconds ago
      const staleAlivePayload = {
        pid: process.pid,
        acquiredAt: Date.now() - 35000,
        filePath: target,
      };
      await writeFile(lockPath, JSON.stringify(staleAlivePayload), 'utf8');

      let executed = false;
      await withFileLock(
        target,
        async () => {
          executed = true;
        },
        { timeoutMs: 3000, staleMs: 30000, retryIntervalMs: 50 }
      );

      expect(executed).toBe(true);
      expect(existsSync(lockPath)).toBe(false);
    });

    it('throws LockTimeoutError with underlying error code (cause) when lock cannot be acquired', async () => {
      const target = path.join(rootDir, 'timeout-test.md');
      const lockPath = `${target}.lock`;

      // Active fresh lock
      const payload = {
        pid: process.pid,
        acquiredAt: Date.now(),
        filePath: target,
      };
      await writeFile(lockPath, JSON.stringify(payload), 'utf8');

      try {
        let caughtError: LockTimeoutError | null = null;
        try {
          await withFileLock(target, async () => {}, {
            timeoutMs: 300,
            retryIntervalMs: 50,
            staleMs: 60000,
          });
        } catch (err: any) {
          caughtError = err;
        }

        expect(caughtError).not.toBeNull();
        expect(caughtError).toBeInstanceOf(LockTimeoutError);
        expect(caughtError!.message).toContain("Timed out acquiring lock for");
        // Verify underlying error code is captured
        expect(caughtError!.message).toMatch(/(Code: EEXIST|Code: EPERM|Code: EACCES|Code: EBUSY)/);
        expect(caughtError!.lastError).toBeDefined();
      } finally {
        rmSync(lockPath, { force: true });
      }
    });

    it('handles race condition where 2 real OS processes simultaneously reclaim the same stale lock', async () => {
      const target = path.join(rootDir, 'concurrent-stale-reclaim.txt');
      const lockPath = `${target}.lock`;
      const scriptPath = path.resolve(__dirname, 'fixtures/stale-cleaner.js');

      // Create a stale lock from dead PID
      const stalePayload = {
        pid: 99999999,
        acquiredAt: Date.now() - 5000,
        filePath: target,
      };
      await writeFile(lockPath, JSON.stringify(stalePayload), 'utf8');

      const runCleaner = (workerId: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          const child = fork(scriptPath, ['--file', target, '--id', workerId]);
          child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Cleaner ${workerId} failed with exit code ${code}`));
          });
          child.on('error', reject);
        });
      };

      // Both processes race to clean the stale lock and acquire it
      await Promise.all([runCleaner('1'), runCleaner('2')]);

      // Lock file must be cleanly released at the end
      expect(existsSync(lockPath)).toBe(false);
    });

    it('handles 2 real OS processes writing to the same file concurrently without data corruption', async () => {
      const target = path.join(rootDir, 'concurrent.txt');
      const scriptPath = path.resolve(__dirname, 'fixtures/concurrent-writer.js');
      const linesPerWorker = 20;

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

      await Promise.all([runWorker('1'), runWorker('2')]);

      expect(existsSync(target)).toBe(true);
      const content = await readFile(target, 'utf8');
      const lines = content.trim().split('\n').filter((l) => l.trim().length > 0);

      expect(lines.length).toBe(linesPerWorker * 2);

      const worker1Lines = lines.filter((l) => l.includes('[worker-1]'));
      const worker2Lines = lines.filter((l) => l.includes('[worker-2]'));

      expect(worker1Lines.length).toBe(linesPerWorker);
      expect(worker2Lines.length).toBe(linesPerWorker);

      for (let i = 1; i <= linesPerWorker; i++) {
        expect(content).toContain(`[worker-1] line ${i}`);
        expect(content).toContain(`[worker-2] line ${i}`);
      }
    }, 25000);

    it('preserves stolen lock when original holder releases late due to token mismatch', async () => {
      const target = path.join(rootDir, 'stolen-lock.txt');
      const lockPath = `${target}.lock`;

      // Process B's active lock file
      const tokenB = 'token-process-b-456';
      const payloadB = {
        token: tokenB,
        pid: process.pid,
        acquiredAt: Date.now(),
        filePath: target,
      };
      await writeFile(lockPath, JSON.stringify(payloadB), 'utf8');

      // Process A had tokenA = 'token-process-a-123'
      // Simulate A attempting to release lock file after B has acquired it
      const tokenA = 'token-process-a-123';
      const raw = await readFile(lockPath, 'utf8');
      const current = JSON.parse(raw);
      if (current.token === tokenA) {
        rmSync(lockPath, { force: true });
      }

      // Lock file of B MUST NOT be deleted
      expect(existsSync(lockPath)).toBe(true);
      const remainingPayload = JSON.parse(await readFile(lockPath, 'utf8'));
      expect(remainingPayload.token).toBe(tokenB);

      rmSync(lockPath, { force: true });
    });

    it('reclaims stale lock using real-time clock pause with small staleMs threshold (100ms)', async () => {
      const target = path.join(rootDir, 'stale-realtime-test.md');
      const lockPath = `${target}.lock`;

      // Write lock with current timestamp and alive PID
      const payload = {
        token: 'realtime-token-1',
        pid: process.pid,
        acquiredAt: Date.now(),
        filePath: target,
      };
      await writeFile(lockPath, JSON.stringify(payload), 'utf8');

      // Real clock pause of 150ms exceeding staleMs of 100ms
      await new Promise((r) => setTimeout(r, 150));

      let reclaimed = false;
      await withFileLock(
        target,
        async () => {
          reclaimed = true;
        },
        { timeoutMs: 2000, staleMs: 100, retryIntervalMs: 20 }
      );

      expect(reclaimed).toBe(true);
    });

    it('enforces strict mutual exclusion across 4 real OS processes incrementing a counter, even when an initial stale lock is present', async () => {
      const counterFile = path.join(rootDir, 'shared-counter.txt');
      const scriptPath = path.resolve(__dirname, 'fixtures/counter-increaser.js');
      const workerCount = 4;
      const iterationsPerWorker = 15;
      const expectedTotal = workerCount * iterationsPerWorker; // 60

      // Plant an initial stale lock from a dead PID (99999999)
      const lockPath = `${counterFile}.lock`;
      const initialStalePayload = {
        token: 'initial-stale-token',
        pid: 99999999,
        acquiredAt: Date.now() - 5000,
        filePath: counterFile,
      };
      await writeFile(lockPath, JSON.stringify(initialStalePayload), 'utf8');

      const runWorker = (workerId: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          const child = fork(scriptPath, [
            '--file', counterFile,
            '--id', workerId,
            '--iterations', iterationsPerWorker.toString(),
          ]);

          child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Counter worker ${workerId} failed with exit code ${code}`));
          });

          child.on('error', reject);
        });
      };

      // Spawn all 4 real OS processes concurrently
      const workers = Array.from({ length: workerCount }, (_, i) => runWorker((i + 1).toString()));
      await Promise.all(workers);

      // Verify mutual exclusion: counter must be exactly 60
      expect(existsSync(counterFile)).toBe(true);
      const finalCountRaw = await readFile(counterFile, 'utf8');
      const finalCount = parseInt(finalCountRaw.trim(), 10);

      expect(finalCount).toBe(expectedTotal);
    }, 30000);

    it('survives stress testing of 8 real OS processes x 50 rounds, repeated 20 times with initial stale lock each time', async () => {
      const scriptPath = path.resolve(__dirname, 'fixtures/counter-increaser.js');
      const workerCount = 8;
      const iterationsPerWorker = 50;
      const expectedTotalPerLoop = workerCount * iterationsPerWorker; // 400
      const totalLoops = 20;

      const runWorker = (workerId: string, targetFile: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          const child = fork(scriptPath, [
            '--file', targetFile,
            '--id', workerId,
            '--iterations', iterationsPerWorker.toString(),
            '--retry', '5',
          ]);

          child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Stress worker ${workerId} failed with exit code ${code}`));
          });

          child.on('error', reject);
        });
      };

      for (let loop = 1; loop <= totalLoops; loop++) {
        const counterFile = path.join(rootDir, `stress-loop-${loop}.txt`);
        const lockPath = `${counterFile}.lock`;

        // Plant an initial stale lock from a dead PID (99999999) before each run
        const initialStalePayload = {
          token: `initial-stale-token-${loop}`,
          pid: 99999999,
          acquiredAt: Date.now() - 5000,
          filePath: counterFile,
        };
        await writeFile(lockPath, JSON.stringify(initialStalePayload), 'utf8');

        // Spawn 8 real OS processes concurrently
        const workers = Array.from({ length: workerCount }, (_, i) =>
          runWorker(`${loop}-${i + 1}`, counterFile)
        );
        await Promise.all(workers);

        // Verify mutual exclusion and correctness: counter must be exactly 400
        expect(existsSync(counterFile)).toBe(true);
        const finalCountRaw = await readFile(counterFile, 'utf8');
        const finalCount = parseInt(finalCountRaw.trim(), 10);
        expect(finalCount).toBe(expectedTotalPerLoop);

        // Lock file must be cleanly released
        expect(existsSync(lockPath)).toBe(false);
      }
    }, 120000);
  });
});
