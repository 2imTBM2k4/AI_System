#!/usr/bin/env node

import { Command } from 'commander';
import { readMemory, writeMemory, appendMemory, listMemories, searchMemory } from './api.js';
import { parseMemory, serializeMemory } from './parser.js';
import { startSession, endSession } from './session.js';
import { MemoryScope } from './types.js';

const program = new Command();

program
  .name('squad-mem')
  .description('Shared file-based memory CLI for AI squad agents')
  .version('0.1.0');

// 1. squad-mem read <path>
program
  .command('read <path>')
  .description('Read a memory document')
  .action(async (relPath: string) => {
    try {
      const doc = await readMemory(relPath);
      if (!doc) {
        process.stderr.write(`Memory file not found: ${relPath}\n`);
        process.exit(1);
      }
      process.stdout.write(serializeMemory(doc));
    } catch (err: any) {
      process.stderr.write(`Error reading memory: ${err.message}\n`);
      process.exit(1);
    }
  });

// 2. squad-mem write <path> --stdin
program
  .command('write <path>')
  .description('Write a memory document from stdin')
  .option('--stdin', 'Read content from stdin')
  .action(async (relPath: string, opts: { stdin?: boolean }) => {
    try {
      if (!opts.stdin) {
        process.stderr.write("Missing '--stdin' flag for write command\n");
        process.exit(1);
      }

      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim().length === 0) {
        process.stderr.write('Cannot write empty content from stdin\n');
        process.exit(1);
      }

      const doc = parseMemory(raw, relPath);
      await writeMemory(relPath, doc);
    } catch (err: any) {
      process.stderr.write(`Error writing memory: ${err.message}\n`);
      process.exit(1);
    }
  });

// 3. squad-mem append <path> "<line>" --by <agent>
program
  .command('append <path> <line>')
  .description('Append a fact or note to a memory document')
  .requiredOption('--by <agent>', 'Agent or persona appending the entry')
  .option('--name <name>', 'Document name (if creating new file)')
  .option('--description <desc>', 'Document description (if creating new file)')
  .option('--scope <scope>', 'Memory scope: project, role, task')
  .action(async (relPath: string, line: string, opts: { by: string; name?: string; description?: string; scope?: string }) => {
    try {
      if (!opts.by || opts.by.trim().length === 0) {
        process.stderr.write('Error appending memory: --by cannot be empty\n');
        process.exit(1);
      }
      await appendMemory(relPath, line, {
        updatedBy: opts.by,
        name: opts.name,
        description: opts.description,
        scope: opts.scope as MemoryScope | undefined,
      });
    } catch (err: any) {
      process.stderr.write(`Error appending memory: ${err.message}\n`);
      process.exit(1);
    }
  });

// 4. squad-mem list [--scope]
program
  .command('list')
  .description('List stored memory documents')
  .option('--scope <scope>', 'Filter by scope: project, role, task')
  .action(async (opts: { scope?: string }) => {
    try {
      const list = await listMemories(opts.scope as MemoryScope | undefined);
      for (const item of list) {
        process.stdout.write(`[${item.scope}] ${item.path} - ${item.name} (${item.updatedAt}) | ${item.description}\n`);
      }
    } catch (err: any) {
      process.stderr.write(`Error listing memory: ${err.message}\n`);
      process.exit(1);
    }
  });

// 5. squad-mem search <keyword>
program
  .command('search <keyword>')
  .description('Search memory documents by keyword')
  .action(async (keyword: string) => {
    try {
      const results = await searchMemory(keyword);
      for (const r of results) {
        process.stdout.write(`${r.path}:${r.lineNumber}: ${r.lineContent}\n`);
      }
    } catch (err: any) {
      process.stderr.write(`Error searching memory: ${err.message}\n`);
      process.exit(1);
    }
  });

function parseMaxChars(val: string): number {
  const num = Number(val);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`--max-chars must be a positive integer, received: '${val}'`);
  }
  return num;
}

// 6. squad-mem start --task <id> --role <r> [--max-chars <n>]
program
  .command('start')
  .description('Start a task session and output concatenated memory context')
  .requiredOption('--task <taskId>', 'Task identifier')
  .requiredOption('--role <role>', 'Agent role')
  .option('--max-chars <n>', 'Maximum character length', parseMaxChars, 8000)
  .action(async (opts: { task: string; role: string; maxChars: number }) => {
    try {
      const context = await startSession({
        taskId: opts.task,
        role: opts.role,
        maxChars: opts.maxChars,
      });
      process.stdout.write(context + '\n');
    } catch (err: any) {
      process.stderr.write(`Error starting session: ${err.message}\n`);
      process.exit(1);
    }
  });

// 7. squad-mem end --task <id> --role <r> --done "..." --remaining "..."
program
  .command('end')
  .description('End a task session and log completed/remaining items')
  .requiredOption('--task <taskId>', 'Task identifier')
  .requiredOption('--role <role>', 'Agent role')
  .requiredOption('--done <text>', 'What was completed')
  .requiredOption('--remaining <text>', 'What remains to be done')
  .action(async (opts: { task: string; role: string; done: string; remaining: string }) => {
    try {
      await endSession({
        taskId: opts.task,
        role: opts.role,
        done: opts.done,
        remaining: opts.remaining,
      });
    } catch (err: any) {
      process.stderr.write(`Error ending session: ${err.message}\n`);
      process.exit(1);
    }
  });

// Run if called directly as entrypoint
program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`CLI execution failed: ${err.message}\n`);
  process.exit(1);
});
