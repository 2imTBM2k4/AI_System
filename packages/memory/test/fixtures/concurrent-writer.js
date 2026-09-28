import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { withFileLock, atomicWrite } from '../../dist/storage.js';

// Parse command line arguments: --file <path> --id <workerId> --count <number>
const args = process.argv.slice(2);
let filePath = '';
let workerId = '';
let count = 10;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file') filePath = args[++i];
  if (args[i] === '--id') workerId = args[++i];
  if (args[i] === '--count') count = parseInt(args[++i], 10);
}

if (!filePath || !workerId) {
  console.error('Usage: node concurrent-writer.js --file <path> --id <id> --count <n>');
  process.exit(1);
}

async function run() {
  for (let i = 0; i < count; i++) {
    await withFileLock(filePath, async () => {
      let currentContent = '';
      if (existsSync(filePath)) {
        currentContent = await readFile(filePath, 'utf8');
      }
      const newLine = `[worker-${workerId}] line ${i + 1}\n`;
      const nextContent = currentContent + newLine;
      await atomicWrite(filePath, nextContent);
    }, { timeoutMs: 15000, retryIntervalMs: 20 });
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Worker ${workerId} failed:`, err);
    process.exit(1);
  });
