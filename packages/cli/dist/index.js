#!/usr/bin/env node
import { appendFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { PlanError, repoRoot, reconcileOrphanedTasks, resolveSquadPaths, SquadOrchestrator, SquadStore, validatePlan, loadSquadConfig, fileConflicts, deleteBranch, removeWorktree, } from '@squad/core';
const CONFIG_FILE = 'squad.config.json';
const STATUS_LIMIT = 10;
const TEMPLATE = {
    configVersion: 1,
    baseBranch: 'main',
    integrationBranch: 'squad/integration',
    worktreeDir: '.squad/worktrees',
    dbFile: '.squad/squad.db',
    planFile: '.squad/plan.json',
    logDir: '.squad/logs',
    maxParallel: 3,
    timeoutMinutes: 30,
    executionMode: 'direct',
    maxReviewRounds: 2,
    bootstrap: [],
    copyFiles: [],
    verify: [],
    agents: { default: { cli: 'claude' } },
    mcpServers: {},
    skills: {},
    plugins: {},
};
async function main(args) {
    const command = args[0];
    if (command === undefined) {
        printUsage();
        return 1;
    }
    switch (command) {
        case 'init':
            return initCommand(args.slice(1));
        case 'plan':
            return planCommand(args.slice(1));
        case 'run':
            return runCommand(args.slice(1));
        case 'do':
            return doCommand(args.slice(1));
        case 'status':
            return statusCommand(args.slice(1));
        case 'merge':
            return mergeCommand(args.slice(1));
        case 'clean':
            return cleanCommand(args.slice(1));
        default:
            printUsage();
            return 1;
    }
}
async function initCommand(args) {
    const { flags, positionals } = parseFlags(args, new Set(['--force']));
    if (positionals.length > 0) {
        throw new Error('Usage: squad init [--force]');
    }
    const force = flags.has('--force');
    const repoPath = await repoRoot(process.cwd());
    const configPath = resolve(repoPath, CONFIG_FILE);
    if (!force && (await exists(configPath))) {
        console.log(`${CONFIG_FILE} already exists; nothing changed. Use --force to replace it.`);
        return 0;
    }
    await writeFile(configPath, `${JSON.stringify(TEMPLATE, null, 2)}\n`, 'utf8');
    await ensureSquadGitignore(repoPath);
    console.log(`Created ${CONFIG_FILE}. Configure bootstrap/verify and project roles as needed (docs/roadmap.md, Appendix A).`);
    return 0;
}
async function planCommand(args) {
    const { positionals } = parseFlags(args, new Set());
    const goal = singleRequiredArgument(positionals, 'Usage: squad plan "<goal>"');
    const runtime = await openRuntime();
    try {
        subscribeTerminal(runtime.orchestrator);
        const result = await runtime.orchestrator.makePlan(runtime.repoPath, goal);
        await writePlan(runtime.config, result.plan);
        return 0;
    }
    finally {
        runtime.store.close();
    }
}
async function runCommand(args) {
    const { flags, positionals } = parseFlags(args, new Set(['--force']));
    if (positionals.length > 1) {
        throw new Error('Usage: squad run [runId] [--force]');
    }
    const runtime = await openRuntime();
    try {
        subscribeTerminal(runtime.orchestrator);
        const suppliedRunId = positionals[0];
        let plan;
        let runId;
        if (suppliedRunId === undefined) {
            plan = await readPlan(runtime.config);
            ({ runId } = await runtime.orchestrator.createRunFromPlan(runtime.repoPath, plan));
        }
        else {
            plan = runtime.store.getRunPlan(suppliedRunId) ?? missingRunPlan(suppliedRunId);
            runId = suppliedRunId;
        }
        if (!allowRun(fileConflicts(plan.tasks), flags.has('--force'))) {
            return 1;
        }
        const results = await runtime.orchestrator.runPlan(runtime.repoPath, plan, runId);
        return results.every((result) => result.status === 'passed') ? 0 : 1;
    }
    finally {
        runtime.store.close();
    }
}
async function doCommand(args) {
    const { flags, positionals } = parseFlags(args, new Set(['--force']));
    const goal = singleRequiredArgument(positionals, 'Usage: squad do "<goal>" [--force]');
    const runtime = await openRuntime();
    try {
        subscribeTerminal(runtime.orchestrator);
        const { runId, plan } = await runtime.orchestrator.makePlan(runtime.repoPath, goal);
        await writePlan(runtime.config, plan);
        if (!allowRun(fileConflicts(plan.tasks), flags.has('--force'))) {
            return 1;
        }
        const results = await runtime.orchestrator.runPlan(runtime.repoPath, plan, runId);
        return results.every((result) => result.status === 'passed') ? 0 : 1;
    }
    finally {
        runtime.store.close();
    }
}
async function statusCommand(args) {
    const { flags, positionals } = parseFlags(args, new Set(['--json']));
    if (positionals.length > 1) {
        throw new Error('Usage: squad status [runId] [--json]');
    }
    const runtime = await openRuntime();
    try {
        const runId = positionals[0];
        if (runId === undefined) {
            const runs = runtime.store.listRuns(STATUS_LIMIT);
            if (flags.has('--json')) {
                console.log(JSON.stringify({ runs }, null, 2));
            }
            else {
                printRuns(runs);
            }
            return 0;
        }
        const run = runtime.store.getRun(runId);
        if (run === undefined) {
            throw new Error(`Run ${runId} does not exist.`);
        }
        const tasks = runtime.store.listTasks(runId);
        if (flags.has('--json')) {
            console.log(JSON.stringify({ run, tasks }, null, 2));
        }
        else {
            console.log(`Run ${run.id}: ${run.status} — ${run.goal}`);
            printTasks(tasks);
        }
        return 0;
    }
    finally {
        runtime.store.close();
    }
}
async function mergeCommand(args) {
    const { positionals } = parseFlags(args, new Set());
    const runId = singleRequiredArgument(positionals, 'Usage: squad merge <runId>');
    const runtime = await openRuntime();
    try {
        const report = await runtime.orchestrator.mergeAll(runId);
        console.log(`Integration branch: ${report.integrationBranch}`);
        for (const entry of report.merged) {
            console.log(`Merged ${entry.id} (${entry.branch}).`);
        }
        for (const entry of report.conflicts) {
            console.error(`Conflict ${entry.id} (${entry.branch}): ${entry.files.join(', ')}`);
        }
        for (const entry of report.verifyFailed) {
            console.error(`Verify failed after ${entry.id} (${entry.branch}), exit ${entry.exitCode}.`);
        }
        for (const entry of report.notMerged) {
            console.log(`Not merged ${entry.id} (${entry.branch}): ${entry.reason}.`);
        }
        return report.conflicts.length > 0 || report.verifyFailed.length > 0 ? 1 : 0;
    }
    finally {
        runtime.store.close();
    }
}
async function cleanCommand(args) {
    const { flags, positionals } = parseFlags(args, new Set(['--delete-branches', '--logs']));
    if (positionals.length > 1) {
        throw new Error('Usage: squad clean [runId] [--delete-branches] [--logs]');
    }
    const runtime = await openRuntime();
    try {
        const requestedRunId = positionals[0];
        if (requestedRunId !== undefined && runtime.store.getRun(requestedRunId) === undefined) {
            throw new Error(`Run ${requestedRunId} does not exist.`);
        }
        const tasks = requestedRunId === undefined
            ? runtime.store.listAllTasks()
            : runtime.store.listTasks(requestedRunId);
        const paths = resolveSquadPaths(runtime.config);
        const deletedBranches = new Set();
        let cleaned = 0;
        for (const task of tasks) {
            if (task.status === 'pending' || task.status === 'running') {
                console.log(`Keeping ${task.runId}/${task.id}: task is ${task.status}.`);
                continue;
            }
            const worktreePath = within(paths.worktreeDir, task.runId, task.id);
            if (await exists(worktreePath)) {
                await removeWorktree(runtime.repoPath, worktreePath);
                console.log(`Removed worktree ${worktreePath}.`);
            }
            if (flags.has('--logs')) {
                const logPath = within(paths.logDir, task.runId, `${task.id}.log`);
                if (await exists(logPath)) {
                    await rm(logPath);
                    console.log(`Removed log ${logPath}.`);
                }
            }
            if (flags.has('--delete-branches') && !deletedBranches.has(task.branch)) {
                try {
                    await deleteBranch(runtime.repoPath, task.branch);
                    deletedBranches.add(task.branch);
                    console.log(`Deleted branch ${task.branch}.`);
                }
                catch (error) {
                    console.log(`Keeping branch ${task.branch}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            cleaned += 1;
        }
        console.log(`Cleaned ${cleaned} finished task(s). SQLite history was kept.`);
        return 0;
    }
    finally {
        runtime.store.close();
    }
}
async function openRuntime() {
    const repoPath = await repoRoot(process.cwd());
    await reconcileOrphanedTasks(repoPath);
    const config = await loadSquadConfig(resolve(repoPath, CONFIG_FILE));
    const store = await SquadStore.open(resolveSquadPaths(config).dbFile);
    return { repoPath, config, store, orchestrator: new SquadOrchestrator({ config, store }) };
}
function subscribeTerminal(orchestrator) {
    orchestrator.on('plan:start', (event) => {
        console.log(`Planning: ${event.goal}`);
    });
    orchestrator.on('plan:log', (event) => {
        process.stdout.write(event.chunk);
    });
    orchestrator.on('plan:done', (event) => {
        console.log(`Plan ${event.runId}: ${event.plan.tasks.length} task(s).`);
        for (const task of event.plan.tasks) {
            console.log(`  ${task.id} [${task.role}] ${task.title}`);
        }
        printConflicts(event.warnings);
    });
    orchestrator.on('run:start', (event) => {
        console.log(`Running ${event.runId}.`);
    });
    orchestrator.on('task:start', (event) => {
        console.log(`Task ${event.taskId} started.`);
    });
    orchestrator.on('task:log', (event) => {
        process.stdout.write(`[${event.taskId}] ${event.chunk}`);
    });
    orchestrator.on('task:done', (event) => {
        console.log(`Task ${event.result.id}: ${event.result.status}.`);
    });
    orchestrator.on('run:done', (event) => {
        console.log(`Run ${event.runId} finished with ${event.results.length} task(s).`);
    });
}
async function writePlan(config, plan) {
    const { planFile } = resolveSquadPaths(config);
    await mkdir(dirname(planFile), { recursive: true });
    await writeFile(planFile, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
}
async function readPlan(config) {
    const { planFile } = resolveSquadPaths(config);
    let document;
    try {
        document = JSON.parse(await readFile(planFile, 'utf8'));
    }
    catch (error) {
        throw new PlanError(`Could not read or parse plan file ${planFile}.`, { cause: error });
    }
    if (typeof document !== 'object' || document === null || typeof document.goal !== 'string') {
        throw new PlanError(`Plan file ${planFile} must contain a string goal.`);
    }
    return validatePlan(document, document.goal);
}
function allowRun(conflicts, force) {
    if (conflicts.length === 0) {
        return true;
    }
    printConflicts(conflicts);
    if (!force) {
        console.error('Run blocked by file conflicts. Re-run with --force to continue.');
        return false;
    }
    console.log('Continuing despite file conflicts because --force was supplied.');
    return true;
}
function printConflicts(conflicts) {
    if (conflicts.length === 0) {
        return;
    }
    console.log('File conflict warnings:');
    for (const conflict of conflicts) {
        console.log(`  ${conflict.taskA} ↔ ${conflict.taskB}: ${conflict.files.join(', ')}`);
    }
}
function printRuns(runs) {
    if (runs.length === 0) {
        console.log('No runs found.');
        return;
    }
    for (const run of runs) {
        console.log(`${run.id}\t${run.status}\t${run.createdAt}\t${run.goal}`);
    }
}
function printTasks(tasks) {
    if (tasks.length === 0) {
        console.log('No task records yet.');
        return;
    }
    for (const task of tasks) {
        console.log(`${task.id}\t${task.status}\t${task.role}\t${task.branch}`);
    }
}
function parseFlags(args, allowed) {
    const flags = new Set();
    const positionals = [];
    for (const argument of args) {
        if (argument.startsWith('--')) {
            if (!allowed.has(argument)) {
                throw new Error(`Unknown option: ${argument}`);
            }
            flags.add(argument);
        }
        else {
            positionals.push(argument);
        }
    }
    return { flags, positionals };
}
function singleRequiredArgument(values, usage) {
    if (values.length !== 1 || values[0].trim().length === 0) {
        throw new Error(usage);
    }
    return values[0];
}
function missingRunPlan(runId) {
    throw new Error(`Run ${runId} does not exist or has no stored plan.`);
}
function within(root, ...segments) {
    const target = resolve(root, ...segments);
    const pathToTarget = relative(root, target);
    if (pathToTarget === '' ||
        pathToTarget === '..' ||
        pathToTarget.startsWith('..\\') ||
        pathToTarget.startsWith('../')) {
        throw new Error(`Refusing to clean a path outside ${root}.`);
    }
    return target;
}
async function ensureSquadGitignore(repoPath) {
    const gitignorePath = resolve(repoPath, '.gitignore');
    const current = (await exists(gitignorePath)) ? await readFile(gitignorePath, 'utf8') : '';
    if (current.split(/\r?\n/).some((line) => line.trim() === '.squad/')) {
        return;
    }
    const prefix = current.length === 0 || current.endsWith('\n') ? current : `${current}\n`;
    await appendFile(gitignorePath, `${prefix}.squad/\n`, 'utf8');
}
async function exists(path) {
    try {
        await stat(path);
        return true;
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}
function printUsage() {
    console.error('Usage: squad <init|plan|run|do|status|merge|clean> ...');
}
main(process.argv.slice(2))
    .then((exitCode) => {
    process.exitCode = exitCode;
})
    .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map