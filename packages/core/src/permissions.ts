import { isAbsolute, relative } from 'node:path';

export type PermissionMode = 'restricted' | 'full';

export interface RolePermissionPolicy {
  paths: string[];
  forbiddenPaths?: string[];
  allowedCommands?: string[];
}

/** Converts a simple glob pattern (with *, **, ?) into a RegExp. */
export function globToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  let regexStr = '^';
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === '*' && normalized[i + 1] === '*') {
      // ** matches everything across directories
      regexStr += '.*';
      i++;
      if (normalized[i + 1] === '/') {
        i++; // skip trailing slash
      }
    } else if (char === '*') {
      // * matches anything except slash
      regexStr += '[^/]*';
    } else if (char === '?') {
      regexStr += '[^/]';
    } else if ('./+^$(){}|[]\\'.includes(char)) {
      regexStr += `\\${char}`;
    } else {
      regexStr += char;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr);
}

/** Matches a relative file path against a list of glob patterns. */
export function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
  return patterns.some((p) => {
    const rx = globToRegex(p);
    return rx.test(normalized);
  });
}

/** Role-based policies adhering to the 8-role pipeline architecture. */
export const DEFAULT_ROLE_POLICIES: Record<string, RolePermissionPolicy> = {
  backend: {
    paths: ['packages/server/**', 'packages/shared-types/**'],
    forbiddenPaths: ['**/*.acceptance.test.*'],
    allowedCommands: ['pnpm', 'npm', 'node', 'git', 'npx', 'tsc', 'fastify'],
  },
  frontend: {
    paths: ['apps/web/**', 'packages/shared-types/**'],
    forbiddenPaths: ['**/*.acceptance.test.*'],
    allowedCommands: ['pnpm', 'npm', 'node', 'git', 'npx', 'tsc', 'vite'],
  },
  mobile: {
    paths: ['apps/mobile/**', 'packages/shared-types/**'],
    forbiddenPaths: ['**/*.acceptance.test.*'],
    allowedCommands: ['pnpm', 'npm', 'node', 'git', 'npx'],
  },
  database: {
    paths: ['packages/db/**', 'packages/server/src/db/**', 'schema/**', 'migrations/**', 'prisma/**', 'drizzle/**'],
    forbiddenPaths: ['**/*.acceptance.test.*'],
    allowedCommands: ['pnpm', 'npm', 'node', 'git', 'npx', 'sqlite3', 'prisma', 'drizzle-kit'],
  },
  devops: {
    paths: [
      'Dockerfile*',
      'docker-compose*',
      '.github/**',
      'scripts/**',
      'package.json',
      'pnpm-lock.yaml',
      'squad.config.json',
      'tsconfig*.json',
    ],
    allowedCommands: ['pnpm', 'npm', 'node', 'git', 'docker', 'docker-compose', 'sh', 'bash', 'powershell', 'cmd'],
  },
  pm: {
    paths: ['docs/**', '.squad/**', '**/*.md'],
    allowedCommands: ['git', 'node', 'pnpm'],
  },
  techlead: {
    paths: ['docs/**', '.squad/**', '**/*.contract.json', '**/*.contract.ts', '**/*.acceptance.test.*', 'packages/shared-types/**'],
    allowedCommands: ['git', 'node', 'pnpm', 'tsc'],
  },
  qa: {
    paths: ['docs/**', '.squad/**', '**/*.test.*', '**/*.spec.*'],
    allowedCommands: ['git', 'node', 'pnpm', 'npm', 'npx', 'vitest', 'jest', 'playwright'],
  },
};

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

/** Validates whether an agent with the given role is allowed to modify a file. */
export function validateFileAccess(
  role: string,
  targetFilePath: string,
  repoPath = '',
  mode: PermissionMode = 'restricted',
  extraForbiddenPaths: string[] = [],
): ValidationResult {
  if (mode === 'full') {
    return { allowed: true };
  }

  // Normalize path relative to repo root if absolute
  let relPath = targetFilePath;
  if (repoPath && isAbsolute(targetFilePath)) {
    relPath = relative(repoPath, targetFilePath);
  }
  relPath = relPath.replace(/\\/g, '/').replace(/^\.?\//, '');

  const policy = DEFAULT_ROLE_POLICIES[role.toLowerCase()];
  if (!policy) {
    // Unrestricted for unlisted/custom roles
    return { allowed: true };
  }

  // 1. Check explicit forbidden paths (e.g. read-only acceptance test contracts)
  const forbidden = [...(policy.forbiddenPaths ?? []), ...extraForbiddenPaths];
  if (matchesAnyPattern(relPath, forbidden)) {
    return {
      allowed: false,
      reason: `Role '${role}' is forbidden from modifying protected path '${relPath}'.`,
    };
  }

  // 2. Check allowed paths
  if (!matchesAnyPattern(relPath, policy.paths)) {
    return {
      allowed: false,
      reason: `Path '${relPath}' is outside the assigned scope for role '${role}'. Allowed scopes: ${policy.paths.join(', ')}.`,
    };
  }

  return { allowed: true };
}

/** Validates whether an agent with the given role is allowed to run a shell command. */
export function validateCommandAccess(
  role: string,
  commandLine: string,
  mode: PermissionMode = 'restricted',
): ValidationResult {
  if (mode === 'full') {
    return { allowed: true };
  }

  const trimmed = commandLine.trim();
  if (trimmed.length === 0) {
    return { allowed: true };
  }

  const policy = DEFAULT_ROLE_POLICIES[role.toLowerCase()];
  if (!policy || !policy.allowedCommands || policy.allowedCommands.length === 0) {
    return { allowed: true };
  }

  // Extract base command (first token, stripped of quotes/path)
  const firstToken = trimmed.split(/\s+/)[0] || '';
  const baseCmd = firstToken.replace(/^["']|["']$/g, '').split(/[\\/]/).pop()?.toLowerCase() || '';

  const isAllowed = policy.allowedCommands.some((allowed) => {
    const cleanAllowed = allowed.toLowerCase();
    return baseCmd === cleanAllowed || baseCmd.startsWith(cleanAllowed);
  });

  if (!isAllowed) {
    return {
      allowed: false,
      reason: `Command '${baseCmd}' is not permitted for role '${role}'. Allowed commands: ${policy.allowedCommands.join(', ')}.`,
    };
  }

  return { allowed: true };
}
