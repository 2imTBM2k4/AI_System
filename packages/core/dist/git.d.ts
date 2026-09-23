export interface GitCommandResult {
    stdout: string;
    stderr: string;
}
export declare class GitCommandError extends Error {
    readonly command: readonly string[];
    readonly exitCode: number | null;
    readonly stderr: string;
    constructor(command: readonly string[], exitCode: number | null, stderr: string);
}
/** Runs Git without a shell so repository paths and arguments remain literal. */
export declare function runGit(cwd: string, args: readonly string[]): Promise<GitCommandResult>;
export declare function isGitRepository(repoPath: string): Promise<boolean>;
export declare function getRepositoryRoot(repoPath: string): Promise<string>;
/** Resolves the repository root from any directory inside the work tree. */
export declare function repoRoot(cwd: string): Promise<string>;
/** Creates a new branch and attaches it to a dedicated worktree. */
export declare function createWorktree(repoPath: string, worktreePath: string, branch: string, baseBranch: string): Promise<void>;
/** Removes a clean worktree. Resilient with filesystem cleanup and prune. */
export declare function removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
/** Sweeps and removes orphan worktree directories under worktreeDir that are no longer active. */
export declare function cleanupOrphanWorktrees(repoPath: string, worktreeDir: string): Promise<void>;
/** Deletes a branch only when Git considers the deletion safe. */
export declare function deleteBranch(repoPath: string, branch: string): Promise<void>;
export declare function listChangedFiles(repoPath: string): Promise<string[]>;
/** Stages every change and creates a commit only when there is work to commit. */
export declare function commitAll(repoPath: string, message: string): Promise<string | undefined>;
export declare function mergeBranch(repoPath: string, branch: string): Promise<void>;
export declare function abortMerge(repoPath: string): Promise<void>;
/** Reverts all tracked modifications and deletes all untracked files in the working tree. */
export declare function rollbackWorkingTree(repoPath: string): Promise<void>;
//# sourceMappingURL=git.d.ts.map