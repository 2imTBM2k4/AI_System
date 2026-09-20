import Fastify, { type FastifyInstance } from 'fastify';
import { reconcileOrphanedTasks } from '@squad/core';
import { RegistryError, RepoRegistry, type RegisteredRepo } from './registry.js';
import { RunsManager } from './runs-manager.js';
import { registerRunsRoutes } from './routes/runs.js';
import { ProvidersManager } from './providers-manager.js';
import { registerProvidersRoutes } from './routes/providers.js';

export interface SquadServerOptions {
  registry?: RepoRegistry;
  runsManager?: RunsManager;
  providersManager?: ProvidersManager;
  logger?: boolean;
}

export interface ReconciliationFailure {
  repo: RegisteredRepo;
  message: string;
}

/** Reconciles every registered repository before the server starts accepting requests. */
export async function reconcileRegisteredRepos(
  registry: RepoRegistry,
): Promise<ReconciliationFailure[]> {
  const failures: ReconciliationFailure[] = [];
  for (const repo of registry.list()) {
    try {
      await reconcileOrphanedTasks(repo.path);
    } catch (error) {
      failures.push({
        repo,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return failures;
}

/** Creates the local-only HTTP API. Persistent state remains in SQLite, never app memory. */
export async function buildServer(options: SquadServerOptions = {}): Promise<FastifyInstance> {
  const ownsRegistry = options.registry === undefined;
  const registry = options.registry ?? await RepoRegistry.open();
  const runsManager = options.runsManager ?? new RunsManager(registry);
  const providersManager = options.providersManager ?? new ProvidersManager();
  const app = Fastify({ logger: options.logger ?? false });

  const reconciliationFailures = await reconcileRegisteredRepos(registry);
  for (const failure of reconciliationFailures) {
    app.log.warn(
      { repoId: failure.repo.id, repoPath: failure.repo.path, error: failure.message },
      'Could not reconcile registered repository during startup',
    );
  }

  app.get('/repos', async () => ({ repos: registry.list() }));

  app.post<{ Body: { path: string } }>(
    '/repos',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['path'],
          properties: { path: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await registry.register(request.body.path);
        return reply.code(result.created ? 201 : 200).send({ repo: result.repo });
      } catch (error) {
        if (error instanceof RegistryError) {
          return reply.code(400).send({ error: { code: error.code, message: error.message } });
        }
        throw error;
      }
    },
  );

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
