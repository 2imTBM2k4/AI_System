export declare const DEFAULT_SERVER_HOST = "127.0.0.1";
export declare const DEFAULT_SERVER_PORT = 4317;
export interface ServerListenOptions {
    host: string;
    port: number;
}
/** Resolves local-only listening defaults while permitting an explicit deployment override. */
export declare function serverListenOptions(env?: NodeJS.ProcessEnv): ServerListenOptions;
//# sourceMappingURL=server-config.d.ts.map