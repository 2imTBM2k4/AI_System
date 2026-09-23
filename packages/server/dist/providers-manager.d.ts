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
    getDefaultAgentMarkdown(role: string): string;
    getAgentMarkdownFile(repoPath: string, role: string): Promise<{
        role: string;
        filePath: string;
        exists: boolean;
        content: string;
        candidatePaths: string[];
    }>;
    saveAgentMarkdownFile(repoPath: string, role: string, content: string, targetFilePath?: string): Promise<{
        role: string;
        filePath: string;
        saved: boolean;
    }>;
}
//# sourceMappingURL=providers-manager.d.ts.map