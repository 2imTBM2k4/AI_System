import { type SquadConfig } from '@squad/core';
import type { ProviderConfigDto, TestProviderRequest, TestProviderResponse } from '@squad/shared-types';
export declare const DEFAULT_PROVIDERS: ProviderConfigDto[];
export declare function maskApiKey(key?: string): string;
export declare class ProvidersManager {
    private readonly home;
    private readonly providersPath;
    constructor(home?: string);
    getProviders(mask?: boolean): Promise<ProviderConfigDto[]>;
    saveProviders(incoming: ProviderConfigDto[]): Promise<ProviderConfigDto[]>;
    testConnection(req: TestProviderRequest): Promise<TestProviderResponse>;
    getRepoConfig(repoPath: string): Promise<SquadConfig>;
    updateRepoConfig(repoPath: string, newConfig: unknown): Promise<SquadConfig>;
}
//# sourceMappingURL=providers-manager.d.ts.map