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

    // Verify uniqueness with Set: exactly 200 distinct entries, no duplicates
    const uniqueSet = new Set(rawLines);
    expect(uniqueSet.size).toBe(workerCount * linesPerWorker);

    // Verify all 10 workers have exactly 20 lines and none are corrupted
    for (let w = 1; w <= workerCount; w++) {
      const workerLines = rawLines.filter((l) => l.startsWith(`- worker-${w}-entry-`));
      expect(workerLines.length).toBe(linesPerWorker);

      for (let i = 1; i <= linesPerWorker; i++) {
        expect(uniqueSet.has(`- worker-${w}-entry-${i}`)).toBe(true);
      }
    }
  }, 45000);

  it('formats appended facts with embedded newline characters into valid distinct fact lines', async () => {
    await appendMemory(
      'tasks/multiline-fact.md',
      'First sub-fact\nSecond sub-fact\n\nThird sub-fact with empty line gap',
      { updatedBy: 'agent' },
      { memoryDir }
    );

    const doc = await readMemory('tasks/multiline-fact.md', { memoryDir });
    expect(doc).not.toBeNull();
    expect(doc!.content).toContain('- First sub-fact');
    expect(doc!.content).toContain('- Second sub-fact');
    expect(doc!.content).toContain('- Third sub-fact with empty line gap');
  });

  it('handles append and search seamlessly on files with Windows CRLF (\\r\\n) line endings', async () => {
    const crlfInitialDoc = `---\r\nname: crlf-doc\r\ndescription: CRLF search test\r\nscope: project\r\nupdatedAt: "2026-09-28T10:00:00.000Z"\r\nupdatedBy: win-agent\r\n---\r\n- Item 1 with CRLF\r\n- Target phrase for search\r\n`;
    
    // Write raw CRLF file
    const targetPath = path.join(memoryDir, 'decisions', 'crlf-search.md');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, crlfInitialDoc, 'utf8');

    // 1. Search on CRLF file
    const searchRes1 = await searchMemory('Target phrase', { memoryDir });
    expect(searchRes1.length).toBe(1);
    expect(searchRes1[0].path).toBe('decisions/crlf-search.md');
    expect(searchRes1[0].lineContent).toBe('- Target phrase for search');
    expect(searchRes1[0].lineContent.includes('\r')).toBe(false);

    // 2. Append to CRLF file
    await appendMemory('decisions/crlf-search.md', 'Appended fact to CRLF file', { updatedBy: 'win-agent' }, { memoryDir });

    const doc = await readMemory('decisions/crlf-search.md', { memoryDir });
    expect(doc).not.toBeNull();
    expect(doc!.content).toContain('Appended fact to CRLF file');
  });

  it('requires explicit scope for non-standard paths and rejects missing scope per Decision (d)', async () => {
    await expect(
      appendMemory('custom/random.md', 'Some fact', { updatedBy: 'agent' }, { memoryDir })
    ).rejects.toThrowError(/Cannot infer memory scope for non-standard path 'custom\/random\.md'/);

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

  it('ignores .lock and .tmp files during listMemories and searchMemory without false warnings', async () => {
    // 1. Create a valid markdown memory file
    await appendMemory('decisions/arch.md', 'Architecture decision content', { updatedBy: 'architect' }, { memoryDir });

    // 2. Plant .lock and .tmp files alongside
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const decisionsDir = path.join(memoryDir, 'decisions');
    mkdirSync(decisionsDir, { recursive: true });

    writeFileSync(path.join(decisionsDir, 'arch.md.lock'), '{"token":"123","pid":456}', 'utf8');
    writeFileSync(path.join(decisionsDir, '.arch.md.999.tmp'), 'raw temp content with SecretKeyword', 'utf8');
    writeFileSync(path.join(decisionsDir, 'temp-file.md.tmp'), 'corrupted temp data with SecretKeyword', 'utf8');

    // 3. Spy on console.warn to verify NO false warnings are emitted
    const warnSpy = vi.spyOn(console, 'warn');

    const list = await listMemories(undefined, { memoryDir });
    expect(list.length).toBe(1);
    expect(list[0].path).toBe('decisions/arch.md');
    expect(warnSpy).not.toHaveBeenCalled();

    // 4. searchMemory must ignore keywords inside .tmp and .lock files
    const searchRes = await searchMemory('SecretKeyword', { memoryDir });
    expect(searchRes.length).toBe(0);

    warnSpy.mockRestore();
  });

  it('enforces role write permission: only role <x> can append to roles/<x>.md', async () => {
    // Correct --by: pm can append to roles/pm.md
    await appendMemory('roles/pm.md', 'PM responsibility note', { updatedBy: 'pm' }, { memoryDir });
    const pmDoc = await readMemory('roles/pm.md', { memoryDir });
    expect(pmDoc).not.toBeNull();
    expect(pmDoc!.content).toContain('PM responsibility note');

    // Different --by: dev cannot append to roles/pm.md
    await expect(
      appendMemory('roles/pm.md', 'Intruder note', { updatedBy: 'dev' }, { memoryDir })
    ).rejects.toThrowError(/Permission denied: agent 'dev' cannot append to 'roles\/pm\.md'/);

    // Other paths are not restricted by this rule
    await appendMemory('tasks/task-002.md', 'Task progress by dev', { updatedBy: 'dev' }, { memoryDir });
    await appendMemory('decisions/api-design.md', 'API design decision by dev', { updatedBy: 'dev' }, { memoryDir });

    const taskDoc = await readMemory('tasks/task-002.md', { memoryDir });
    const decisionDoc = await readMemory('decisions/api-design.md', { memoryDir });
    expect(taskDoc!.content).toContain('Task progress by dev');
    expect(decisionDoc!.content).toContain('API design decision by dev');
  });
});
