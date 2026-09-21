import { spawn } from 'node:child_process';
import { type LoadedSquadConfig } from './config.js';
import { GitCommandError, runGit } from './git.js';
import { topoSort } from './planner.js';
import { type SquadStore } from './store.js';
import type { TaskStatus } from './types.js';

export interface MergeReport {
  runId: string;
  integrationBranch: string;
  merged: { id: string; branch: string }[];
  conflicts: { id: string; branch: string; files: string[] }[];
  verifyFailed: { id: string; branch: string; exitCode: number }[];
  notMerged: { id: string; branch: string; reason: TaskStatus }[];
}

export interface MergeRunOptions {
  runId: string;
  config: LoadedSquadConfig;
  store: SquadStore;
}

/** Merges passed task branches in dependency order and keeps integration green. */
export async function mergeRun(options: MergeRunOptions): Promise<MergeReport> {
  const run = options.store.getRun(options.runId);
  if (run === undefined || run.plan === null) {
    throw new Error(`Run ${options.runId} does not have a stored plan to merge.`);
  }

  const { config } = options.config;
  const recordsById = new Map(options.store.listTasks(options.runId).map((record) => [record.id, record]));
  const report: MergeReport = {
    runId: options.runId,
    integrationBranch: config.integrationBranch,
    merged: [],
    conflicts: [],
    verifyFailed: [],
    notMerged: [],
  };

  if (config.executionMode === 'direct') {
    for (const task of topoSort(run.plan.tasks)) {
      const record = recordsById.get(task.id);
      const status = record === undefined ? 'error' : asTaskStatus(record.status);
      if (status === 'passed') {
        report.merged.push({ id: task.id, branch: task.branch });
      } else {
        report.notMerged.push({ id: task.id, branch: task.branch, reason: status });
      }
    }
    return report;
  }

  await prepareIntegrationBranch(run.repoPath, config.baseBranch, config.integrationBranch);

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
    } catch (error) {
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

async function prepareIntegrationBranch(
  repoPath: string,
  baseBranch: string,
  integrationBranch: string,
): Promise<void> {
  if (!(await branchExists(repoPath, integrationBranch))) {
    await runGit(repoPath, ['checkout', '-b', integrationBranch, baseBranch]);
    return;
  }

  await runGit(repoPath, ['checkout', integrationBranch]);
  try {
    await runGit(repoPath, ['merge', '--no-edit', baseBranch]);
  } catch (error) {
    await abortMergeQuietly(repoPath);
    throw error;
  }
}

async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await runGit(repoPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
    return true;
  } catch (error) {
    if (error instanceof GitCommandError && error.exitCode === 1) {
      return false;
    }
    throw error;
  }
}

async function conflictedFiles(repoPath: string): Promise<string[]> {
  const { stdout } = await runGit(repoPath, ['diff', '--name-only', '--diff-filter=U']);
  return stdout.split(/\r?\n/).filter((filePath) => filePath.length > 0);
}

async function abortMergeQuietly(repoPath: string): Promise<void> {
  try {
    await runGit(repoPath, ['merge', '--abort']);
  } catch (error) {
    if (!(error instanceof GitCommandError)) {
      throw error;
    }
  }
}

async function headCommit(repoPath: string): Promise<string> {
  const { stdout } = await runGit(repoPath, ['rev-parse', 'HEAD']);
  return stdout.trim();
}

function runVerification(commands: string[], cwd: string): Promise<number> {
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
    const finish = (exitCode: number): void => {
      if (!settled) {
        settled = true;
        resolve(exitCode);
      }
    };
    child.once('error', () => finish(-1));
    child.once('close', (code) => finish(code ?? -1));
  });
}

function asTaskStatus(status: string): TaskStatus {
  const statuses: readonly TaskStatus[] = [
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
  return statuses.includes(status as TaskStatus) ? (status as TaskStatus) : 'error';
}
