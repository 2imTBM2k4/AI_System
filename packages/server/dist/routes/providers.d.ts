import type { FastifyPluginAsync } from 'fastify';
import type { RepoRegistry } from '../registry.js';
import type { ProvidersManager } from '../providers-manager.js';
export interface ProvidersRoutesOptions {
    registry: RepoRegistry;
    providersManager: ProvidersManager;
}
export declare const registerProvidersRoutes: FastifyPluginAsync<ProvidersRoutesOptions>;
//# sourceMappingURL=providers.d.ts.map