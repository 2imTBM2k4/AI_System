import { execFile } from 'node:child_process';
export class GitCommandError extends Error {
    command;
    exitCode;
    stderr;
    constructor(command, exitCode, stderr) {
        const detail = stderr.trim();
        super(`Git command failed: git ${command.join(' ')}${detail ? `\n${detail}` : ''}`);
        this.name = 'GitCommandError';
        this.command = command;
        this.exitCode = exitCode;
        this.stderr = stderr;
    }
}
/** Runs Git without a shell so repository paths and arguments remain literal. */
export async function runGit(cwd, args) {
    return new Promise((resolve, reject) => {
        execFile('git', ['-c', 'core.longpaths=true', ...args], {
            cwd,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
            windowsHide: true,
        }, (error, stdout, stderr) => {
            if (error !== null) {
                reject(new GitCommandError(args, typeof error.code === 'number' ? error.code : null, stderr));
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}
export async function isGitRepository(repoPath) {
    try {
        const { stdout } = await runGit(repoPath, ['rev-parse', '--is-inside-work-tree']);
        return stdout.trim() === 'true';
    }
    catch (error) {
        if (error instanceof GitCommandError) {
            return false;
        }
        throw error;
    }
}
export async function getRepositoryRoot(repoPath) {
    const { stdout } = await runGit(repoPath, ['rev-parse', '--show-toplevel']);
    return stdout.trim();
}
/** Resolves the repository root from any directory inside the work tree. */
export async function repoRoot(cwd) {
    return getRepositoryRoot(cwd);
}
/** Creates a new branch and attaches it to a dedicated worktree. */
export async function createWorktree(repoPath, worktreePath, branch, baseBranch) {
    await runGit(repoPath, [
        'worktree',
        'add',
        '--no-track',
        '-B',
        branch,
        worktreePath,
        baseBranch,
    ]);
}
/** Removes a clean worktree. It intentionally does not force-delete uncommitted work. */
export async function removeWorktree(repoPath, worktreePath) {
    await runGit(repoPath, ['worktree', 'remove', '--force', worktreePath]);
    await runGit(repoPath, ['worktree', 'prune']);
}
/** Deletes a branch only when Git considers the deletion safe. */
export async function deleteBranch(repoPath, branch) {
    await runGit(repoPath, ['branch', '-d', branch]);
}
export async function listChangedFiles(repoPath) {
    const { stdout } = await runGit(repoPath, ['status', '--porcelain=v1', '-z']);
    const entries = stdout.split('\0');
    const changedFiles = new Set();
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
export async function commitAll(repoPath, message) {
    if ((await listChangedFiles(repoPath)).length === 0) {
        return undefined;
    }
    await runGit(repoPath, ['add', '--all']);
    await runGit(repoPath, ['commit', '-m', message]);
    const { stdout } = await runGit(repoPath, ['rev-parse', 'HEAD']);
    return stdout.trim();
}
export async function mergeBranch(repoPath, branch) {
    await runGit(repoPath, ['merge', '--no-ff', branch]);
}
export async function abortMerge(repoPath) {
    await runGit(repoPath, ['merge', '--abort']);
}
//# sourceMappingURL=git.js.map