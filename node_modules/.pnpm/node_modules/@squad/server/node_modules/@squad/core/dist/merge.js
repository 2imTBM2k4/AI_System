import { spawn } from 'node:child_process';
import { GitCommandError, runGit } from './git.js';
import { topoSort } from './planner.js';
/** Merges passed task branches in dependency order and keeps integration green. */
export async function mergeRun(options) {
    const run = options.store.getRun(options.runId);
    if (run === undefined || run.plan === null) {
        throw new Error(`Run ${options.runId} does not have a stored plan to merge.`);
    }
    const { config } = options.config;
    await prepareIntegrationBranch(run.repoPath, config.baseBranch, config.integrationBranch);
    const recordsById = new Map(options.store.listTasks(options.runId).map((record) => [record.id, record]));
    const report = {
        runId: options.runId,
        integrationBranch: config.integrationBranch,
        merged: [],
        conflicts: [],
        verifyFailed: [],
        notMerged: [],
    };
    for (const task of topoSort(run.plan.tasks)) {
        const record = recordsById.get(task.id);
        const status = record === undefined ? 'error' : asTaskStatus(record.status);
        if (status !== 'passed') {
            report.notMerged.push({ id: task.id, branch: task.branch, reason: status });
            continue;
        }
        const beforeHead = await headCommit(run.repoPath);
        try {
            await runGit(run.repoPath, ['merge', '--no-ff', '--no-edit', task.branch]);
        }
        catch (error) {
            const files = await conflictedFiles(run.repoPath);
            await abortMergeQuietly(run.repoPath);
            if (!(error instanceof GitCommandError)) {
                throw error;
            }
            report.conflicts.push({ id: task.id, branch: task.branch, files });
            continue;
        }
        const afterHead = await headCommit(run.repoPath);
        const verification = await runVerification(config.verify, run.repoPath);
        if (verification !== 0) {
            if (afterHead !== beforeHead) {
                await runGit(run.repoPath, ['reset', '--hard', 'HEAD~1']);
            }
            report.verifyFailed.push({ id: task.id, branch: task.branch, exitCode: verification });
            continue;
        }
        report.merged.push({ id: task.id, branch: task.branch });
    }
    return report;
}
async function prepareIntegrationBranch(repoPath, baseBranch, integrationBranch) {
    if (!(await branchExists(repoPath, integrationBranch))) {
        await runGit(repoPath, ['checkout', '-b', integrationBranch, baseBranch]);
        return;
    }
    await runGit(repoPath, ['checkout', integrationBranch]);
    try {
        await runGit(repoPath, ['merge', '--no-edit', baseBranch]);
    }
    catch (error) {
        await abortMergeQuietly(repoPath);
        throw error;
    }
}
async function branchExists(repoPath, branch) {
    try {
        await runGit(repoPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
        return true;
    }
    catch (error) {
        if (error instanceof GitCommandError && error.exitCode === 1) {
            return false;
        }
        throw error;
    }
}
async function conflictedFiles(repoPath) {
    const { stdout } = await runGit(repoPath, ['diff', '--name-only', '--diff-filter=U']);
    return stdout.split(/\r?\n/).filter((filePath) => filePath.length > 0);
}
async function abortMergeQuietly(repoPath) {
    try {
        await runGit(repoPath, ['merge', '--abort']);
    }
    catch (error) {
        if (!(error instanceof GitCommandError)) {
            throw error;
        }
    }
}
async function headCommit(repoPath) {
    const { stdout } = await runGit(repoPath, ['rev-parse', 'HEAD']);
    return stdout.trim();
}
function runVerification(commands, cwd) {
    if (commands.length === 0) {
        return Promise.resolve(0);
    }
    return new Promise((resolve) => {
        const child = spawn(commands.join(' && '), [], {
            cwd,
            shell: true,
            windowsHide: true,
            stdio: 'ignore',
        });
        let settled = false;
        const finish = (exitCode) => {
            if (!settled) {
                settled = true;
                resolve(exitCode);
            }
        };
        child.once('error', () => finish(-1));
        child.once('close', (code) => finish(code ?? -1));
    });
}
function asTaskStatus(status) {
    const statuses = [
        'pending',
        'running',
        'passed',
        'verify_failed',
        'agent_failed',
        'bootstrap_failed',
        'skipped',
        'cancelled',
        'interrupted',
        'error',
    ];
    return statuses.includes(status) ? status : 'error';
}
//# sourceMappingURL=merge.js.map