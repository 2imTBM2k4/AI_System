import { appendMemory } from '../../dist/api.js';

// Parse command line arguments
const args = process.argv.slice(2);
let memoryDir = '';
let relPath = '';
let workerId = '';
let count = 20;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--memoryDir') memoryDir = args[++i];
  if (args[i] === '--file') relPath = args[++i];
  if (args[i] === '--workerId') workerId = args[++i];
  if (args[i] === '--count') count = parseInt(args[++i], 10);
}

if (!memoryDir || !relPath || !workerId) {
  console.error('Usage: node concurrent-appender.js --memoryDir <dir> --file <relPath> --workerId <id> --count <n>');
  process.exit(1);
}

async function run() {
  for (let i = 0; i < count; i++) {
    const fact = `worker-${workerId}-entry-${i + 1}`;
    await appendMemory(
      relPath,
      fact,
      { updatedBy: `worker-agent-${workerId}` },
      { memoryDir, lockTimeoutMs: 30000 }
    );
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Concurrent appender worker ${workerId} failed:`, err);
    process.exit(1);
  });
