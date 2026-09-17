export const DEFAULT_SERVER_HOST = '127.0.0.1';
export const DEFAULT_SERVER_PORT = 4317;
/** Resolves local-only listening defaults while permitting an explicit deployment override. */
export function serverListenOptions(env = process.env) {
    const host = env.SQUAD_SERVER_HOST?.trim() || DEFAULT_SERVER_HOST;
    const value = env.SQUAD_SERVER_PORT;
    if (value === undefined || value.trim().length === 0) {
        return { host, port: DEFAULT_SERVER_PORT };
    }
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error(`SQUAD_SERVER_PORT must be an integer from 1 to 65535; received ${value}.`);
    }
    return { host, port };
}
//# sourceMappingURL=server-config.js.map