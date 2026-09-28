import { withFileLock } from '../../dist/storage.js';

const args = process.argv.slice(2);
let filePath = '';
let workerId = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file') filePath = args[++i];
  if (args[i] === '--id') workerId = args[++i];
}

if (!filePath || !workerId) {
  process.exit(1);
}

async function run() {
  await withFileLock(
    filePath,
    async () => {
      // Hold lock briefly to simulate work
      await new Promise((r) => setTimeout(r, 50));
    },
    { timeoutMs: 5000, retryIntervalMs: 20 }
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Cleaner worker ${workerId} failed:`, err);
    process.exit(1);
  });
