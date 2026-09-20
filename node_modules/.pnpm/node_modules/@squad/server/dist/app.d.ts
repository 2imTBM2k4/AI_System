import { type FastifyInstance } from 'fastify';
import { RepoRegistry, type RegisteredRepo } from './registry.js';
import { RunsManager } from './runs-manager.js';
import { ProvidersManager } from './providers-manager.js';
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
export declare function reconcileRegisteredRepos(registry: RepoRegistry): Promise<ReconciliationFailure[]>;
/** Creates the local-only HTTP API. Persistent state remains in SQLite, never app memory. */
export declare function buildServer(options?: SquadServerOptions): Promise<FastifyInstance>;
//# sourceMappingURL=app.d.ts.map