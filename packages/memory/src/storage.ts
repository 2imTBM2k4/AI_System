import { open, rename, unlink, mkdir, stat, readFile, writeFile, realpath } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Custom error thrown when a path violates security boundaries (path traversal or symlink escape).
 */
export class PathTraversalError extends Error {
  constructor(message: string, public readonly targetPath?: string) {
    const formatted = targetPath ? `[Security] ${message}: ${targetPath}` : `[Security] ${message}`;
    super(formatted);
    this.name = 'PathTraversalError';
  }
}

/**
 * Custom error thrown when acquiring a file lock exceeds the configured timeout.
 */
export class LockTimeoutError extends Error {
  constructor(public readonly filePath: string, public readonly timeoutMs: number) {
    super(`Timed out acquiring lock for '${filePath}' after ${timeoutMs}ms`);
    this.name = 'LockTimeoutError';
  }
}

/**
 * Resolves a relative path against a root directory, strictly preventing path traversal
 * and symlink directory escapes outside of root.
 *
 * @param root - Absolute or base root directory.
 * @param relPath - Relative path inside the root directory.
 * @returns Fully resolved, verified safe absolute path.
 * @throws PathTraversalError if traversal or symlink escape is detected.
 */
export function resolveSafePath(root: string, relPath: string): string {
  if (!relPath || typeof relPath !== 'string') {
    throw new PathTraversalError('Relative path must be a non-empty string');
  }

  // Reject absolute paths
  if (path.isAbsolute(relPath)) {
    throw new PathTraversalError('Absolute paths are not allowed', relPath);
  }

  // Normalize path segments and check for traversal
  const normalizedRel = path.normalize(relPath);
  if (normalizedRel === '..' || normalizedRel.startsWith(`..${path.sep}`) || normalizedRel.startsWith('../')) {
    throw new PathTraversalError('Path traversal detected', relPath);
  }

  const resolvedRoot = path.resolve(root);
  const realRoot = existsSync(resolvedRoot) ? realpathSync(resolvedRoot) : resolvedRoot;

  const targetPath = path.resolve(realRoot, normalizedRel);

  // Check if target is inside realRoot
  const relFromRoot = path.relative(realRoot, targetPath);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
    throw new PathTraversalError('Resolved path escapes root directory', relPath);
  }

  // Check symlinks for existing file or existing parent directories
  let probe = targetPath;
  while (probe && probe !== path.dirname(probe)) {
    if (existsSync(probe)) {
      try {
        const realProbe = realpathSync(probe);
        const relProbeFromRoot = path.relative(realRoot, realProbe);
        if (relProbeFromRoot.startsWith('..') || path.isAbsolute(relProbeFromRoot)) {
          throw new PathTraversalError('Symlink resolves outside root directory', relPath);
        }
      } catch (err) {
        if (err instanceof PathTraversalError) throw err;
        // Ignore errors for permissions/other non-security issues during realpath
      }
      break;
    }
    probe = path.dirname(probe);
  }

  return targetPath;
}

/**
 * Atomically writes content to a destination file by first writing to a unique temporary file
 * in the same directory, then renaming it to the target file.
 * Automatically creates parent directories if needed.
 *
 * @param filePath - The destination file path.
 * @param content - String or Buffer content to write.
 */
export async function atomicWrite(filePath: string, content: string | Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tempFilePath = path.join(dir, `.${path.basename(filePath)}.${randomUUID()}.tmp`);

  try {
    // Write and flush to disk
    await writeFile(tempFilePath, content, { encoding: 'utf8', flag: 'w' });
    // Atomic rename replaces destination file
    await rename(tempFilePath, filePath);
  } catch (error) {
    // Clean up temporary file on failure
    try {
      if (existsSync(tempFilePath)) {
        await unlink(tempFilePath);
      }
    } catch {
      // Ignore cleanup error
    }
    throw error;
  }
}

/**
 * Options for file locking.
 */
export interface LockOptions {
  /** Maximum time to wait for the lock before throwing LockTimeoutError (default: 10,000ms) */
  timeoutMs?: number;
  /** Duration after which an existing lock is considered stale and safe to reclaim (default: 30,000ms) */
  staleMs?: number;
  /** Base interval between acquisition attempts (default: 50ms) */
  retryIntervalMs?: number;
}

interface LockPayload {
  pid: number;
  acquiredAt: number;
  filePath: string;
}

/**
 * Checks whether a process with the given PID is currently active.
 *
 * @param pid - Process ID to check.
 * @returns true if process is alive, false otherwise.
 */
function isProcessAlive(pid: number): boolean {
  if (pid <= 0 || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // ESRCH means process does not exist
    return err.code !== 'ESRCH';
  }
}

/**
 * Executes an asynchronous function within an exclusive file lock.
 * Uses atomic open('wx') flag, checks for stale locks, and guarantees cleanup.
 *
 * @param filePath - The target file path to lock (lock file will be <filePath>.lock).
 * @param fn - The asynchronous function to execute while holding the lock.
 * @param options - Lock configuration options.
 * @returns Result of the executed function.
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const {
    timeoutMs = 10000,
    staleMs = 30000,
    retryIntervalMs = 50,
  } = options;

  const lockPath = `${filePath}.lock`;
  const dir = path.dirname(lockPath);
  await mkdir(dir, { recursive: true });

  const startTime = Date.now();
  let acquired = false;

  while (!acquired) {
    try {
      // Ensure directory exists in case of concurrent directory operations
      await mkdir(dir, { recursive: true });

      // Attempt atomic creation of the lock file
      const handle = await open(lockPath, 'wx');
      const payload: LockPayload = {
        pid: process.pid,
        acquiredAt: Date.now(),
        filePath,
      };
      await handle.writeFile(JSON.stringify(payload), 'utf8');
      await handle.close();
      acquired = true;
      break;
    } catch (err: any) {
      // On Windows, STATUS_DELETE_PENDING or simultaneous file sharing contention
      // manifests as EPERM or EACCES. Treat them as contention and retry.
      const isContention =
        err.code === 'EEXIST' ||
        err.code === 'EPERM' ||
        err.code === 'EACCES' ||
        err.code === 'EBUSY';

      if (!isContention) {
        if (err.code === 'ENOENT') {
          // Parent dir was momentarily absent; retry next loop
          await mkdir(dir, { recursive: true }).catch(() => {});
        } else {
          throw err;
        }
      }

      // Lock file already exists, inspect for staleness
      try {
        let isStale = false;
        try {
          const raw = await readFile(lockPath, 'utf8');
          const payload = JSON.parse(raw) as LockPayload;
          const age = Date.now() - (payload.acquiredAt || 0);

          if (age > staleMs) {
            isStale = true;
          } else if (payload.pid && !isProcessAlive(payload.pid)) {
            // Process died without releasing lock
            isStale = true;
          }
        } catch {
          // If reading/parsing fails, check file modification time
          const fileStat = await stat(lockPath);
          if (Date.now() - fileStat.mtimeMs > staleMs) {
            isStale = true;
          }
        }

        if (isStale) {
          // Remove stale lock and attempt retry immediately
          await unlink(lockPath).catch(() => {});
        }
      } catch {
        // Stat/unlink failed (maybe removed by another process), retry next loop
      }

      // Check for timeout
      if (Date.now() - startTime >= timeoutMs) {
        throw new LockTimeoutError(filePath, timeoutMs);
      }

      // Backoff with randomized jitter to prevent lock convoy / thundering herd
      const jitter = Math.floor(Math.random() * 20);
      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs + jitter));
    }
  }

  try {
    return await fn();
  } finally {
    // Release lock file
    try {
      await unlink(lockPath);
    } catch {
      // Ignore if already unlinked
    }
  }
}
