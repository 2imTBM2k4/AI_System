export interface RegisteredRepo {
    id: string;
    path: string;
    name: string | null;
    addedAt: string;
}
export interface RegisterRepoResult {
    repo: RegisteredRepo;
    created: boolean;
}
export declare class RegistryError extends Error {
    readonly code: 'REPO_PATH_INVALID' | 'REPO_NOT_INITIALIZED';
    constructor(code: RegistryError['code'], message: string, options?: ErrorOptions);
}
/** Returns the user-level Squad directory without coupling registry state to any repository. */
export declare function squadHome(env?: NodeJS.ProcessEnv): string;
/** SQLite registry that maps stable server IDs to local repository roots. */
export declare class RepoRegistry {
    private readonly database;
    private constructor();
    static open(home?: string): Promise<RepoRegistry>;
    close(): void;
    list(): RegisteredRepo[];
    get(id: string): RegisteredRepo | undefined;
    /** Validates a repository at the boundary, then safely registers it exactly once. */
    register(inputPath: string): Promise<RegisterRepoResult>;
    private findByPath;
}
//# sourceMappingURL=registry.d.ts.map