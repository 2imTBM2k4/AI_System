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
    // Prune any disconnected worktrees first
    try {
        await runGit(repoPath, ['worktree', 'prune']);
    }
    catch { }
    // Check if branch is currently checked out in another worktree
    try {
        const { stdout } = await runGit(repoPath, ['worktree', 'list', '--porcelain']);
        const blocks = stdout.split(/\r?\n\r?\n/);
        for (const block of blocks) {
            const lines = block.split(/\r?\n/);
            let wtPath;
            let wtBranch;
            for (const line of lines) {
                if (line.startsWith('worktree ')) {
                    wtPath = line.slice('worktree '.length).trim();
                }
                else if (line.startsWith('branch ')) {
                    wtBranch = line.slice('branch '.length).trim();
                }
            }
            if (wtPath && wtBranch && (wtBranch === `refs/heads/${branch}` || wtBranch === branch)) {
                if (wtPath !== repoPath) {
                    try {
                        await runGit(repoPath, ['worktree', 'remove', '--force', wtPath]);
                        await runGit(repoPath, ['worktree', 'prune']);
                    }
                    catch { }
                }
            }
        }
    }
    catch { }
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
    }
    catch (err) {
        const msg = String(err);
        if (msg.includes('is already used by worktree at')) {
            const match = msg.match(/is already used by worktree at '([^']+)'/);
            if (match && match[1]) {
                try {
                    await runGit(repoPath, ['worktree', 'remove', '--force', match[1]]);
                    await runGit(repoPath, ['worktree', 'prune']);
                }
                catch { }
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
/** Removes a clean worktree. Resilient with filesystem cleanup and prune. */
export async function removeWorktree(repoPath, worktreePath) {
    try {
        await runGit(repoPath, ['worktree', 'remove', '--force', worktreePath]);
    }
    catch {
        try {
            const { rmSync, existsSync } = await import('node:fs');
            if (existsSync(worktreePath)) {
                rmSync(worktreePath, { recursive: true, force: true });
            }
        }
        catch { }
    }
    finally {
        try {
            await runGit(repoPath, ['worktree', 'prune']);
        }
        catch { }
    }
}
/** Sweeps and removes orphan worktree directories under worktreeDir that are no longer active. */
export async function cleanupOrphanWorktrees(repoPath, worktreeDir) {
    try {
        await runGit(repoPath, ['worktree', 'prune']);
        const { stdout } = await runGit(repoPath, ['worktree', 'list', '--porcelain']);
        const lines = stdout.split('\n');
        const registeredPaths = new Set();
        for (const line of lines) {
            if (line.startsWith('worktree ')) {
                const raw = line.slice('worktree '.length).trim();
                registeredPaths.add(raw.toLowerCase());
            }
        }
        const { existsSync, readdirSync, rmSync } = await import('node:fs');
        const { resolve: pathResolve } = await import('node:path');
        if (!existsSync(worktreeDir)) {
            return;
        }
        const entries = readdirSync(worktreeDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const runDirPath = pathResolve(worktreeDir, entry.name);
                const taskEntries = readdirSync(runDirPath, { withFileTypes: true });
                for (const taskEntry of taskEntries) {
                    if (taskEntry.isDirectory()) {
                        const fullPath = pathResolve(runDirPath, taskEntry.name);
                        if (!registeredPaths.has(fullPath.toLowerCase())) {
                            try {
                                rmSync(fullPath, { recursive: true, force: true });
                            }
                            catch { }
                        }
                    }
                }
                // If run directory is now empty, remove it too
                try {
                    if (readdirSync(runDirPath).length === 0) {
                        rmSync(runDirPath, { recursive: true, force: true });
                    }
                }
                catch { }
            }
        }
        await runGit(repoPath, ['worktree', 'prune']);
    }
    catch { }
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
/** Reverts all tracked modifications and deletes all untracked files in the working tree. */
export async function rollbackWorkingTree(repoPath) {
    await runGit(repoPath, ['reset', '--hard', 'HEAD']);
    await runGit(repoPath, ['clean', '-fd']);
}
//# sourceMappingURL=git.js.map