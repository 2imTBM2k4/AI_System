import Fastify from 'fastify';
import { reconcileOrphanedTasks } from '@squad/core';
import { RegistryError, RepoRegistry } from './registry.js';
import { RunsManager } from './runs-manager.js';
import { registerRunsRoutes } from './routes/runs.js';
import { ProvidersManager } from './providers-manager.js';
import { registerProvidersRoutes } from './routes/providers.js';
/** Reconciles every registered repository before the server starts accepting requests. */
export async function reconcileRegisteredRepos(registry) {
    const failures = [];
    for (const repo of registry.list()) {
        try {
            await reconcileOrphanedTasks(repo.path);
        }
        catch (error) {
            failures.push({
                repo,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return failures;
}
/** Creates the local-only HTTP API. Persistent state remains in SQLite, never app memory. */
export async function buildServer(options = {}) {
    const ownsRegistry = options.registry === undefined;
    const registry = options.registry ?? await RepoRegistry.open();
    const runsManager = options.runsManager ?? new RunsManager(registry);
    const providersManager = options.providersManager ?? new ProvidersManager();
    const app = Fastify({ logger: options.logger ?? false });
    const reconciliationFailures = await reconcileRegisteredRepos(registry);
    for (const failure of reconciliationFailures) {
        app.log.warn({ repoId: failure.repo.id, repoPath: failure.repo.path, error: failure.message }, 'Could not reconcile registered repository during startup');
    }
    app.get('/health', async () => ({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        registeredRepos: registry.list().length,
    }));
    app.get('/repos', async () => ({ repos: registry.list() }));
    app.post('/repos', {
        schema: {
            body: {
                type: 'object',
                additionalProperties: false,
                required: ['path'],
                properties: { path: { type: 'string', minLength: 1 } },
            },
        },
    }, async (request, reply) => {
        try {
            const result = await registry.register(request.body.path);
            return reply.code(result.created ? 201 : 200).send({ repo: result.repo });
        }
        catch (error) {
            if (error instanceof RegistryError) {
                return reply.code(400).send({ error: { code: error.code, message: error.message } });
            }
            throw error;
        }
    });
    app.post('/repos/detect', {
        schema: {
            body: {
                type: 'object',
                additionalProperties: false,
                required: ['path'],
                properties: { path: { type: 'string', minLength: 1 } },
            },
        },
    }, async (request, reply) => {
        const { access } = await import('node:fs/promises');
        const { join, resolve } = await import('node:path');
        const repoPath = resolve(request.body.path);
        const lockFiles = [
            { file: 'pnpm-lock.yaml', pm: 'pnpm' },
            { file: 'yarn.lock', pm: 'yarn' },
            { file: 'package-lock.json', pm: 'npm' },
        ];
        for (const { file, pm } of lockFiles) {
            try {
                await access(join(repoPath, file));
                return reply.code(200).send({
                    packageManager: pm,
                    bootstrap: [`${pm} install`],
                });
            }
            catch {
                // not found, continue
            }
        }
        return reply.code(200).send({
            packageManager: null,
            bootstrap: [],
        });
    });
    await registerRunsRoutes(app, { runsManager });
    await registerProvidersRoutes(app, { registry, providersManager });
    app.addHook('onClose', async () => {
        await runsManager.close();
        if (ownsRegistry) {
            registry.close();
        }
    });
    return app;
}
//# sourceMappingURL=app.js.map