import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCanonicalRole } from './config.js';

/**
 * Resolves the absolute path to packages/memory/dist/cli.js.
 */
export function resolveMemoryCliPath(customPath?: string): string {
  if (customPath) {
    return resolve(customPath);
  }
  if (process.env.SQUAD_MEMORY_CLI_PATH) {
    return resolve(process.env.SQUAD_MEMORY_CLI_PATH);
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../memory/dist/cli.js');
}

/**
 * Ensures the .squad/bin directory exists in the main repo root with squad-mem shims.
 * Throws a clear error if packages/memory has not been built yet.
 */
export function ensureMemoryShim(repoPath: string, customCliPath?: string): string {
  const binDir = resolve(repoPath, '.squad/bin');
  mkdirSync(binDir, { recursive: true });

  const cliPath = resolveMemoryCliPath(customCliPath);
  if (!existsSync(cliPath)) {
    throw new Error(
      `packages/memory chưa được build (không tìm thấy ${cliPath}). Hãy chạy 'pnpm -F @squad/memory build' trước.`,
    );
  }

  // Windows cmd shim
  const cmdShimPath = resolve(binDir, 'squad-mem.cmd');
  const cmdContent = `@node "${cliPath}" %*\r\n`;
  writeFileSync(cmdShimPath, cmdContent, { encoding: 'utf8', mode: 0o755 });

  // POSIX sh shim
  const shShimPath = resolve(binDir, 'squad-mem');
  const shContent = `#!/bin/sh\nexec node "${cliPath}" "$@"\n`;
  writeFileSync(shShimPath, shContent, { encoding: 'utf8', mode: 0o755 });
  try {
    chmodSync(shShimPath, 0o755);
  } catch {
    // Ignore chmod failure on systems where chmod is not supported
  }

  return binDir;
}

/**
 * Injects squad-mem environment variables and prepends .squad/bin to PATH.
 *
 * Rules:
 * - SQUAD_RUN_ID = runId (omitted if runId is not yet created, e.g. during planning)
 * - SQUAD_ROLE = canonical role name (pm, techlead, backend, frontend, mobile, database, qa, devops)
 * - SQUAD_MEMORY_DIR = absolute path to .squad/memory in the main repo (not worktree)
 * - Dynamic variables overwrite baseEnv
 * - Prepends .squad/bin to PATH
 */
export function injectMemoryEnv(
  repoPath: string,
  role: string,
  runId?: string,
  baseEnv?: Record<string, string>,
  customCliPath?: string,
): Record<string, string> {
  const binDir = ensureMemoryShim(repoPath, customCliPath);
  const canonicalRole = getCanonicalRole(role);
  const memoryDir = resolve(repoPath, '.squad/memory');

  const env: Record<string, string> = { ...baseEnv };

  // Prepend binDir to PATH
  const pathDelimiter = process.platform === 'win32' ? ';' : ':';
  const existingPath = env.PATH ?? env.Path ?? process.env.PATH ?? process.env.Path ?? '';
  const newPath = existingPath ? `${binDir}${pathDelimiter}${existingPath}` : binDir;

  env.PATH = newPath;
  if (process.platform === 'win32') {
    env.Path = newPath;
  }

  // SQUAD_RUN_ID: only set if runId exists
  if (runId) {
    env.SQUAD_RUN_ID = runId;
  } else {
    delete env.SQUAD_RUN_ID;
  }

  // Dynamic overrides
  env.SQUAD_ROLE = canonicalRole;
  env.SQUAD_MEMORY_DIR = memoryDir;

  return env;
}
