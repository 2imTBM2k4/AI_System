import { buildServer } from './app.js';
import { serverListenOptions } from './server-config.js';

async function main(): Promise<void> {
  const { host, port } = serverListenOptions();
  const app = await buildServer({ logger: true });
  await app.listen({ host, port });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
