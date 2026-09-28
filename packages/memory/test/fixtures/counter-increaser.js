import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { withFileLock, atomicWrite } from '../../dist/storage.js';

const args = process.argv.slice(2);
let filePath = '';
let workerId = '';
let iterations = 10;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file') filePath = args[++i];
  if (args[i] === '--id') workerId = args[++i];
  if (args[i] === '--iterations') iterations = parseInt(args[++i], 10);
}

if (!filePath || !workerId) {
  process.exit(1);
}

async function run() {
  for (let i = 0; i < iterations; i++) {
    await withFileLock(
      filePath,
      async () => {
        let current = 0;
        if (existsSync(filePath)) {
          const raw = await readFile(filePath, 'utf8');
          current = parseInt(raw.trim(), 10) || 0;
        }
        const next = current + 1;
        await atomicWrite(filePath, String(next));
      },
      { timeoutMs: 25000, retryIntervalMs: 20 }
    );
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Counter worker ${workerId} failed:`, err);
    process.exit(1);
  });
