import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface LockMetadata {
  pid: number;
  taskId: string;
  acquiredAt: string;
}

export class TaskLockError extends Error {
  readonly code: 'TASK_LOCKED' | 'LOCK_ACQUIRE_FAILED' | 'LOCK_RELEASE_FAILED';

  constructor(code: TaskLockError['code'], message: string) {
    super(message);
    this.name = 'TaskLockError';
    this.code = code;
  }
}

/** Checks whether a process with the given PID is currently active. */
export function isPidAlive(pid: number | null | undefined): boolean {
  if (pid === null || pid === undefined || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

/**
 * File-level concurrency lock using non-blocking atomic file creation in `.squad/locks/`.
 * Detects and reclaims stale locks from deceased processes.
 */
export class TaskLockManager {
  private readonly heldLocks = new Set<string>();

  constructor(private readonly lockDir: string) {
    if (!existsSync(this.lockDir)) {
      mkdirSync(this.lockDir, { recursive: true });
    }
  }

  private getLockFilePath(taskId: string): string {
    const sanitized = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return resolve(this.lockDir, `${sanitized}.lock`);
  }

  /**
   * Attempts to acquire exclusive lock for a task. Non-blocking.
   * Returns true if lock was acquired, false if held by an active process.
   */
  async acquire(taskId: string): Promise<boolean> {
    const lockPath = this.getLockFilePath(taskId);

    if (existsSync(lockPath)) {
      try {
        const content = readFileSync(lockPath, 'utf8');
        const metadata: LockMetadata = JSON.parse(content);
        if (isPidAlive(metadata.pid)) {
          // An active process holds this lock
          return false;
        }
        // Stale lock from crashed process: remove it
        try {
          rmSync(lockPath, { force: true });
        } catch {
          return false;
        }
      } catch {
        // Corrupted lock file: clean up
        try {
          rmSync(lockPath, { force: true });
        } catch {
          return false;
        }
      }
    }

    try {
      const metadata: LockMetadata = {
        pid: process.pid,
        taskId,
        acquiredAt: new Date().toISOString(),
      };
      writeFileSync(lockPath, JSON.stringify(metadata, null, 2), { flag: 'wx' });
      this.heldLocks.add(taskId);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
        return false;
      }
      throw new TaskLockError('LOCK_ACQUIRE_FAILED', `Failed to write lock file for task ${taskId}: ${String(error)}`);
    }
  }

  /** Releases the lock for a specific task. */
  async release(taskId: string): Promise<void> {
    const lockPath = this.getLockFilePath(taskId);
    this.heldLocks.delete(taskId);
    if (!existsSync(lockPath)) {
      return;
    }

    try {
      const content = readFileSync(lockPath, 'utf8');
      const metadata: LockMetadata = JSON.parse(content);
      // Only release if we own it or if the owner is dead
      if (metadata.pid === process.pid || !isPidAlive(metadata.pid)) {
        rmSync(lockPath, { force: true });
      }
    } catch {
      // If reading/parsing fails, force remove
      try {
        rmSync(lockPath, { force: true });
      } catch {
        // Ignore removal error
      }
    }
  }

  /** Releases all locks held by the current process instance. */
  async releaseAll(): Promise<void> {
    for (const taskId of [...this.heldLocks]) {
      await this.release(taskId);
    }
  }
}
