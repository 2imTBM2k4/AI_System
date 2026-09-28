import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fork } from 'node:child_process';
import {
  readMemory,
  writeMemory,
  appendMemory,
  listMemories,
  searchMemory,
  deleteMemory,
  MemoryDoc,
  MemoryParseError,
} from '../src/index.js';

describe('Memory API (T3)', () => {
  let memoryDir: string;

  beforeEach(() => {
    memoryDir = mkdtempSync(path.join(tmpdir(), 'squad-mem-api-test-'));
  });

  afterEach(() => {
    if (existsSync(memoryDir)) {
      rmSync(memoryDir, { recursive: true, force: true });
    }
  });

  it('returns null when reading non-existent file without throwing error', async () => {
    const doc = await readMemory('non-existent.md', { memoryDir });
    expect(doc).toBeNull();
  });

  it('creates new file with valid frontmatter when appendMemory is called on missing file', async () => {
    await appendMemory(
      'tasks/task-001.md',
      'Đã hoàn thành cấu hình ban đầu',
      {
        updatedBy: 'gemini-agent',
        description: 'Session state for task 001',
      },
      { memoryDir }
    );

    const doc = await readMemory('tasks/task-001.md', { memoryDir });
    expect(doc).not.toBeNull();
    expect(doc!.frontmatter.name).toBe('task-001');
    expect(doc!.frontmatter.scope).toBe('task');
    expect(doc!.frontmatter.updatedBy).toBe('gemini-agent');
    expect(doc!.frontmatter.description).toBe('Session state for task 001');
    expect(doc!.content).toContain('- Đã hoàn thành cấu hình ban đầu');
  });

  it('preserves Vietnamese text with accents and emojis across read and write operations', async () => {
    const doc: MemoryDoc = {
      frontmatter: {
        name: 'vietnamese-test',
        description: 'Kiểm tra tiếng Việt có dấu và biểu tượng cảm xúc 🇻🇳',
        scope: 'project',
        updatedAt: new Date().toISOString(),
        updatedBy: 'tester',
      },
      content: '\n- Dòng 1: Học thầy không tày học bạn 🌟\n- Dòng 2: Cẩn tắc vô áy náy 🛡️\n',
    };

    await writeMemory('decisions/vietnamese.md', doc, { memoryDir });

    const fetched = await readMemory('decisions/vietnamese.md', { memoryDir });
    expect(fetched).not.toBeNull();
    expect(fetched!.frontmatter.description).toBe(doc.frontmatter.description);
    expect(fetched!.content).toContain('Học thầy không tày học bạn 🌟');
    expect(fetched!.content).toContain('Cẩn tắc vô áy náy 🛡️');
  });

  it('throws error with file path on readMemory when frontmatter is hand-corrupted, but listMemories skips with warning', async () => {
    // Write valid memory
    await appendMemory('decisions/valid.md', 'Valid rule', { updatedBy: 'agent' }, { memoryDir });

    // Manually write corrupt file
    const corruptPath = path.join(memoryDir, 'decisions', 'corrupt.md');
    writeFileSync(corruptPath, '---\nname: [unclosed\ndescription: corrupt\n---\nCorrupt content', 'utf8');

    // readMemory must throw MemoryParseError containing relative path
    await expect(readMemory('decisions/corrupt.md', { memoryDir })).rejects.toThrowError(MemoryParseError);
    await expect(readMemory('decisions/corrupt.md', { memoryDir })).rejects.toThrowError(/decisions\/corrupt\.md/);

    // listMemories must not crash; it skips corrupt file and logs warning
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const list = await listMemories(undefined, { memoryDir });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping corrupted memory file 'decisions/corrupt.md'"));
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('valid');
    warnSpy.mockRestore();
  });

  it('filters memories by scope in listMemories', async () => {
    await appendMemory('index.md', 'Overview', { updatedBy: 'orchestrator', scope: 'project' }, { memoryDir });
    await appendMemory('roles/architect.md', 'Architect notes', { updatedBy: 'architect', scope: 'role' }, { memoryDir });
    await appendMemory('tasks/task-99.md', 'Task 99 state', { updatedBy: 'worker', scope: 'task' }, { memoryDir });

    const projectList = await listMemories('project', { memoryDir });
    expect(projectList.length).toBe(1);
    expect(projectList[0].path).toBe('index.md');

    const roleList = await listMemories('role', { memoryDir });
    expect(roleList.length).toBe(1);
    expect(roleList[0].path).toBe('roles/architect.md');

    const taskList = await listMemories('task', { memoryDir });
    expect(taskList.length).toBe(1);
    expect(taskList[0].path).toBe('tasks/task-99.md');
  });

  it('searches memory content case-insensitively and returns empty array when no matches', async () => {
    await appendMemory('roles/tester.md', 'Never mock critical concurrency logic in tests', { updatedBy: 'tester' }, { memoryDir });
    await appendMemory('decisions/sqlite.md', 'Use SQLite WAL mode for concurrency', { updatedBy: 'architect' }, { memoryDir });

    const searchUpper = await searchMemory('CONCURRENCY', { memoryDir });
    expect(searchUpper.length).toBe(2);

    const searchSub = await searchMemory('wal mode', { memoryDir });
    expect(searchSub.length).toBe(1);
    expect(searchSub[0].path).toBe('decisions/sqlite.md');
    expect(searchSub[0].lineContent).toContain('Use SQLite WAL mode for concurrency');

    const noResult = await searchMemory('nonExistentTermxyz123', { memoryDir });
    expect(noResult).toEqual([]);
  });

  it('deletes memory file idempotently without error when file does not exist', async () => {
    // Should not throw on non-existent file
    await expect(deleteMemory('decisions/non-existent.md', { memoryDir })).resolves.not.toThrow();

    // Create and delete
    await appendMemory('decisions/temp.md', 'To be deleted', { updatedBy: 'agent' }, { memoryDir });
    expect(await readMemory('decisions/temp.md', { memoryDir })).not.toBeNull();

    await deleteMemory('decisions/temp.md', { memoryDir });
    expect(await readMemory('decisions/temp.md', { memoryDir })).toBeNull();
  });

  it('supports 10 real OS processes concurrently appending 20 lines each to the same file resulting in 200 clean lines', async () => {
    const relFile = 'tasks/stress-concurrent.md';
    const scriptPath = path.resolve(__dirname, 'fixtures/concurrent-appender.js');
    const workerCount = 10;
    const linesPerWorker = 20;

    const runWorker = (workerId: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        const child = fork(scriptPath, [
          '--memoryDir', memoryDir,
          '--file', relFile,
          '--workerId', workerId.toString(),
          '--count', linesPerWorker.toString(),
        ]);

        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Worker ${workerId} exited with code ${code}`));
        });

        child.on('error', reject);
      });
    };

    // Spawn 10 real OS processes simultaneously
    const workers = Array.from({ length: workerCount }, (_, i) => runWorker(i + 1));
    await Promise.all(workers);

    // Verify final content
    const doc = await readMemory(relFile, { memoryDir });
    expect(doc).not.toBeNull();

    const rawLines = doc!.content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- worker-'));

    // Must have exactly 200 lines (10 workers * 20 lines)
    expect(rawLines.length).toBe(workerCount * linesPerWorker);

    // Verify all 10 workers have exactly 20 lines and none are corrupted
    for (let w = 1; w <= workerCount; w++) {
      const workerLines = rawLines.filter((l) => l.startsWith(`- worker-${w}-entry-`));
      expect(workerLines.length).toBe(linesPerWorker);

      for (let i = 1; i <= linesPerWorker; i++) {
        expect(rawLines).toContain(`- worker-${w}-entry-${i}`);
      }
    }
  }, 45000);

  it('requires explicit scope for non-standard paths and rejects missing scope per Decision (d)', async () => {
    // Fails when scope is omitted on arbitrary path
    await expect(
      appendMemory('custom/random.md', 'Some fact', { updatedBy: 'agent' }, { memoryDir })
    ).rejects.toThrowError(/Cannot infer memory scope for non-standard path 'custom\/random\.md'/);

    // Succeeds when explicit scope is provided
    await appendMemory(
      'custom/random.md',
      'Some fact',
      { updatedBy: 'agent', scope: 'project' },
      { memoryDir }
    );
    const doc = await readMemory('custom/random.md', { memoryDir });
    expect(doc).not.toBeNull();
    expect(doc!.frontmatter.scope).toBe('project');
  });
});
