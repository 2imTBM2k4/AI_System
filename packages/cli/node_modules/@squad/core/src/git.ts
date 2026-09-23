import { execFile } from 'node:child_process';

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export class GitCommandError extends Error {
  readonly command: readonly string[];
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(command: readonly string[], exitCode: number | null, stderr: string) {
    const detail = stderr.trim();
    super(`Git command failed: git ${command.join(' ')}${detail ? `\n${detail}` : ''}`);
    this.name = 'GitCommandError';
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/** Runs Git without a shell so repository paths and arguments remain literal. */
export async function runGit(
  cwd: string,
  args: readonly string[],
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-c', 'core.longpaths=true', ...args],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(
            new GitCommandError(
              args,
              typeof error.code === 'number' ? error.code : null,
              stderr,
            ),
          );
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}

export async function isGitRepository(repoPath: string): Promise<boolean> {
  try {
    const { stdout } = await runGit(repoPath, ['rev-parse', '--is-inside-work-tree']);
    return stdout.trim() === 'true';
  } catch (error) {
    if (error instanceof GitCommandError) {
      return false;
    }

    throw error;
  }
}

export async function getRepositoryRoot(repoPath: string): Promise<string> {
  const { stdout } = await runGit(repoPath, ['rev-parse', '--show-toplevel']);
  return stdout.trim();
}

/** Resolves the repository root from any directory inside the work tree. */
export async function repoRoot(cwd: string): Promise<string> {
  return getRepositoryRoot(cwd);
}

/** Creates a new branch and attaches it to a dedicated worktree. */
export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
  baseBranch: string,
): Promise<void> {
  // Prune any disconnected worktrees first
  try {
    await runGit(repoPath, ['worktree', 'prune']);
  } catch {}

  // Check if branch is currently checked out in another worktree
  try {
    const { stdout } = await runGit(repoPath, ['worktree', 'list', '--porcelain']);
    const blocks = stdout.split(/\r?\n\r?\n/);
    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      let wtPath: string | undefined;
      let wtBranch: string | undefined;
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wtPath = line.slice('worktree '.length).trim();
        } else if (line.startsWith('branch ')) {
          wtBranch = line.slice('branch '.length).trim();
        }
      }
      if (wtPath && wtBranch && (wtBranch === `refs/heads/${branch}` || wtBranch === branch)) {
        if (wtPath !== repoPath) {
          try {
            await runGit(repoPath, ['worktree', 'remove', '--force', wtPath]);
            await runGit(repoPath, ['worktree', 'prune']);
          } catch {}
        }
      }
    }
  } catch {}

  try {
    await runGit(repoPath, [
      'worktree',
      'add',
      '--no-track',
      '-B',
      branch,
      worktreePath,
      baseBranch,
    ]);
  } catch (err: unknown) {
    const msg = String(err);
    if (msg.includes('is already used by worktree at')) {
      const match = msg.match(/is already used by worktree at '([^']+)'/);
      if (match && match[1]) {
        try {
          await runGit(repoPath, ['worktree', 'remove', '--force', match[1]]);
          await runGit(repoPath, ['worktree', 'prune']);
        } catch {}
      }
      await runGit(repoPath, [
        'worktree',
        'add',
        '--no-track',
        '-B',
        branch,
        worktreePath,
        baseBranch,
      ]);
      return;
    }
    throw err;
  }
}

/** Removes a clean worktree. It intentionally does not force-delete uncommitted work. */
export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await runGit(repoPath, ['worktree', 'remove', '--force', worktreePath]);
  await runGit(repoPath, ['worktree', 'prune']);
}

/** Deletes a branch only when Git considers the deletion safe. */
export async function deleteBranch(repoPath: string, branch: string): Promise<void> {
  await runGit(repoPath, ['branch', '-d', branch]);
}

export async function listChangedFiles(repoPath: string): Promise<string[]> {
  const { stdout } = await runGit(repoPath, ['status', '--porcelain=v1', '-z']);
  const entries = stdout.split('\0');
  const changedFiles = new Set<string>();

  for (let index = 0; index < entries.length - 1; index += 1) {
    const entry = entries[index];
    const status = entry.slice(0, 2);
    const filePath = entry.slice(3);

    if (filePath.length > 0) {
      changedFiles.add(filePath);
    }

    if (status.includes('R') || status.includes('C')) {
      index += 1;
      const originalPath = entries[index];
      if (originalPath.length > 0) {
        changedFiles.add(originalPath);
      }
    }
  }

  return [...changedFiles];
}

/** Stages every change and creates a commit only when there is work to commit. */
export async function commitAll(
  repoPath: string,
  message: string,
): Promise<string | undefined> {
  if ((await listChangedFiles(repoPath)).length === 0) {
    return undefined;
  }

  await runGit(repoPath, ['add', '--all']);
  await runGit(repoPath, ['commit', '-m', message]);
  const { stdout } = await runGit(repoPath, ['rev-parse', 'HEAD']);
  return stdout.trim();
}

export async function mergeBranch(repoPath: string, branch: string): Promise<void> {
  await runGit(repoPath, ['merge', '--no-ff', branch]);
}

export async function abortMerge(repoPath: string): Promise<void> {
  await runGit(repoPath, ['merge', '--abort']);
}

/** Reverts all tracked modifications and deletes all untracked files in the working tree. */
export async function rollbackWorkingTree(repoPath: string): Promise<void> {
  await runGit(repoPath, ['reset', '--hard', 'HEAD']);
  await runGit(repoPath, ['clean', '-fd']);
}
