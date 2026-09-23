import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskLockManager } from '../src/lock.js';

describe('TaskLockManager', () => {
  let tempDir: string;
  let lockManager: TaskLockManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'squad-lock-test-'));
    lockManager = new TaskLockManager(tempDir);
  });

  afterEach(async () => {
    await lockManager.releaseAll();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('acquires and releases lock successfully', async () => {
    const taskId = 'task-1';
    const acquired = await lockManager.acquire(taskId);
    expect(acquired).toBe(true);

    // Another attempt on the same task while locked should fail
    const secondManager = new TaskLockManager(tempDir);
    const secondAcquired = await secondManager.acquire(taskId);
    expect(secondAcquired).toBe(false);

    // After release, should be able to acquire
    await lockManager.release(taskId);
    const thirdAcquired = await secondManager.acquire(taskId);
    expect(thirdAcquired).toBe(true);
    await secondManager.release(taskId);
  });

  it('reclaims stale lock from a dead PID', async () => {
    const taskId = 'task-stale';
    const lockPath = join(tempDir, `${taskId}.lock`);
    
    // Simulate a dead PID (e.g. 99999999)
    const fs = await import('node:fs');
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 99999999, taskId, acquiredAt: new Date().toISOString() }),
    );

    const acquired = await lockManager.acquire(taskId);
    expect(acquired).toBe(true);
  });
});
