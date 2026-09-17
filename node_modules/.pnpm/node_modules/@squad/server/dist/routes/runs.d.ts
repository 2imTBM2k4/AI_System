import type { FastifyPluginAsync } from 'fastify';
import { RunsManager } from '../runs-manager.js';
export interface RunsRoutesOptions {
    runsManager: RunsManager;
}
export declare const registerRunsRoutes: FastifyPluginAsync<RunsRoutesOptions>;
//# sourceMappingURL=runs.d.ts.map