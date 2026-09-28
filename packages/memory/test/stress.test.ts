import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fork } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync, rmSync } from 'node:fs';

describe('Lock stress testing (test:stress)', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-mem-stress-test-'));
  });

  afterEach(() => {
    if (existsSync(rootDir)) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

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
