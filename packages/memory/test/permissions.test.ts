import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  writeMemory,
  appendMemory,
  deleteMemory,
  readMemory,
  startSession,
  MemoryDoc,
} from '../src/index.js';

describe('Task T7.0: Strict Write Path Allowlist & Permission Enforcement', () => {
  let memoryDir: string;

  beforeEach(() => {
    memoryDir = mkdtempSync(path.join(tmpdir(), 'squad-mem-allowlist-test-'));
  });

  afterEach(() => {
    if (existsSync(memoryDir)) {
      rmSync(memoryDir, { recursive: true, force: true });
    }
  });

  const dummyDoc: MemoryDoc = {
    frontmatter: {
      name: 'pm',
      description: 'PM documentation',
      scope: 'role',
      updatedAt: new Date().toISOString(),
      updatedBy: 'pm',
    },
    content: 'Role documentation body',
  };

  describe('Shape (a): index.md is recognized by allowlist and rejected as read-only', () => {
    it('rejects writeMemory to index.md with exact read-only error', async () => {
      await expect(
        writeMemory('index.md', dummyDoc, { memoryDir, by: 'pm' })
      ).rejects.toThrowError('index.md is read-only for agents; edit it manually');
    });

    it('rejects appendMemory to index.md with exact read-only error', async () => {
      await expect(
        appendMemory('index.md', 'New convention', { updatedBy: 'pm' }, { memoryDir })
      ).rejects.toThrowError('index.md is read-only for agents; edit it manually');
    });

    it('rejects deleteMemory to index.md with exact read-only error', async () => {
      await expect(
        deleteMemory('index.md', { memoryDir, by: 'pm' })
      ).rejects.toThrowError('index.md is read-only for agents; edit it manually');
    });
  });

  describe('Shape (b) & Rejections: Strict allowlist denies all non-conforming shapes', () => {
    const rejectedShapes = [
      // Case variations of directory
      { path: 'Roles/pm.md', reason: 'uppercase first letter in directory' },
      { path: 'ROLES/pm.md', reason: 'all-uppercase directory' },
      { path: 'Decisions/d1.md', reason: 'uppercase directory Decisions' },
      { path: 'Tasks/t1.md', reason: 'uppercase directory Tasks' },

      // Relative hops and dot segments
      { path: './roles/pm.md', reason: 'leading dot-slash' },
      { path: 'roles/./pm.md', reason: 'inline dot segment' },
      { path: 'decisions/../roles/pm.md', reason: 'parent directory traversal' },
      { path: './index.md', reason: 'leading dot-slash on index' },
      { path: 'INDEX.md', reason: 'uppercase INDEX.md' },
      { path: 'decisions/../index.md', reason: 'relative traversal to index' },

      // Windows backslashes
      { path: 'roles\\pm.md', reason: 'Windows backslash in roles path' },
      { path: 'decisions\\d1.md', reason: 'Windows backslash in decisions path' },
      { path: '.\\index.md', reason: 'Windows backslash on index' },

      // NTFS alternate data streams
      { path: 'roles/pm.md::$DATA', reason: 'NTFS alternate data stream' },
      { path: 'index.md::$DATA', reason: 'NTFS alternate data stream on index' },

      // Trailing dots and spaces
      { path: 'index.md.', reason: 'trailing dot on index.md' },
      { path: 'index.md ', reason: 'trailing space on index.md' },
      { path: 'roles/pm.md.', reason: 'trailing dot on roles file' },
      { path: 'roles/pm.md ', reason: 'trailing space on roles file' },

      // Nested directories and arbitrary directories
      { path: 'decisions/a/b.md', reason: 'nested directory under decisions' },
      { path: 'notes/x.md', reason: 'unrecognized directory notes' },
      { path: 'custom/doc.md', reason: 'unrecognized directory custom' },
    ];

    for (const { path: rejectedPath, reason } of rejectedShapes) {
      it(`rejects writeMemory on '${rejectedPath}' (${reason})`, async () => {
        await expect(
          writeMemory(rejectedPath, dummyDoc, { memoryDir, by: 'pm' })
        ).rejects.toThrowError(/Invalid memory write target/);
      });

      it(`rejects appendMemory on '${rejectedPath}' (${reason})`, async () => {
        await expect(
          appendMemory(rejectedPath, 'fact', { updatedBy: 'pm' }, { memoryDir })
        ).rejects.toThrowError(/Invalid memory write target/);
      });

      it(`rejects deleteMemory on '${rejectedPath}' (${reason})`, async () => {
        await expect(
          deleteMemory(rejectedPath, { memoryDir, by: 'pm' })
        ).rejects.toThrowError(/Invalid memory write target/);
      });
    }
  });

  describe('Valid allowed write shapes & --by role permissions', () => {
    it('allows writeMemory to roles/pm.md when --by matches pm', async () => {
      await writeMemory('roles/pm.md', dummyDoc, { memoryDir, by: 'pm' });
      const readDoc = await readMemory('roles/pm.md', { memoryDir });
      expect(readDoc).not.toBeNull();
      expect(readDoc?.content.trim()).toBe('Role documentation body');
    });

    it('allows appendMemory to roles/pm.md when --by matches pm', async () => {
      await appendMemory('roles/pm.md', 'PM learned something', { updatedBy: 'pm' }, { memoryDir });
      const readDoc = await readMemory('roles/pm.md', { memoryDir });
      expect(readDoc).not.toBeNull();
      expect(readDoc?.content).toContain('- PM learned something');
    });

    it('allows deleteMemory to roles/pm.md when --by matches pm', async () => {
      await writeMemory('roles/pm.md', dummyDoc, { memoryDir, by: 'pm' });
      expect(await readMemory('roles/pm.md', { memoryDir })).not.toBeNull();

      await deleteMemory('roles/pm.md', { memoryDir, by: 'pm' });
      expect(await readMemory('roles/pm.md', { memoryDir })).toBeNull();
    });

    it('rejects writeMemory to roles/pm.md when --by is different (dev)', async () => {
      await expect(
        writeMemory('roles/pm.md', dummyDoc, { memoryDir, by: 'dev' })
      ).rejects.toThrowError(/Permission denied: agent 'dev' cannot write to 'roles\/pm\.md'/);
    });

    it('rejects appendMemory to roles/pm.md when --by is different (dev)', async () => {
      await expect(
        appendMemory('roles/pm.md', 'Fact', { updatedBy: 'dev' }, { memoryDir })
      ).rejects.toThrowError(/Permission denied: agent 'dev' cannot append to 'roles\/pm\.md'/);
    });

    it('rejects deleteMemory to roles/pm.md when --by is different (dev)', async () => {
      await expect(
        deleteMemory('roles/pm.md', { memoryDir, by: 'dev' })
      ).rejects.toThrowError(/Permission denied: agent 'dev' cannot delete 'roles\/pm\.md'/);
    });

    it('rejects role operations when --by is empty or omitted', async () => {
      await expect(
        writeMemory('roles/pm.md', dummyDoc, { memoryDir, by: '' })
      ).rejects.toThrowError(/Agent identity \(--by\) is required/);

      await expect(
        appendMemory('roles/pm.md', 'Fact', { updatedBy: '' }, { memoryDir })
      ).rejects.toThrowError(/Agent identity \(--by\) is required/);

      await expect(
        deleteMemory('roles/pm.md', { memoryDir, by: '' })
      ).rejects.toThrowError(/Agent identity \(--by\) is required/);
    });

    it('allows write and append to decisions/ and tasks/ with any --by', async () => {
      const decisionDoc: MemoryDoc = {
        frontmatter: {
          name: 'd1',
          description: 'Architecture decision 1',
          scope: 'project',
          updatedAt: new Date().toISOString(),
          updatedBy: 'pm',
        },
        content: 'Decision details',
      };

      await writeMemory('decisions/d1.md', decisionDoc, { memoryDir, by: 'pm' });
      await appendMemory('decisions/d1.md', 'Follow-up note', { updatedBy: 'dev' }, { memoryDir });

      const readDecision = await readMemory('decisions/d1.md', { memoryDir });
      expect(readDecision).not.toBeNull();
      expect(readDecision?.content).toContain('- Follow-up note');

      await appendMemory('tasks/t-100.md', 'Task milestone reached', { updatedBy: 'qa' }, { memoryDir });
      const readTask = await readMemory('tasks/t-100.md', { memoryDir });
      expect(readTask).not.toBeNull();
      expect(readTask?.content).toContain('- Task milestone reached');
    });
  });

  describe('Real Windows filesystem behavior comparison', () => {
    it('demonstrates that raw Windows NTFS alternate data streams can access data but allowlist strictly rejects them', async () => {
      // Create a test file
      const targetFile = path.join(memoryDir, 'test-target.md');
      writeFileSync(targetFile, 'original', 'utf8');

      // On Windows NTFS, accessing "test-target.md::$DATA" accesses the default unnamed data stream
      if (process.platform === 'win32') {
        const { readFileSync } = await import('node:fs');
        const streamData = readFileSync(`${targetFile}::$DATA`, 'utf8');
        expect(streamData).toBe('original');
      }

      // But allowlist rejects ::$DATA and trailing dots/spaces before reaching the filesystem!
      await expect(
        writeMemory('roles/pm.md::$DATA', dummyDoc, { memoryDir, by: 'pm' })
      ).rejects.toThrowError(/Invalid memory write target/);

      await expect(
        writeMemory('roles/pm.md.', dummyDoc, { memoryDir, by: 'pm' })
      ).rejects.toThrowError(/Invalid memory write target/);

      await expect(
        writeMemory('roles/pm.md ', dummyDoc, { memoryDir, by: 'pm' })
      ).rejects.toThrowError(/Invalid memory write target/);
    });
  });

  describe('Read operations are NOT blocked by allowlist', () => {
    it('readMemory and startSession function normally', async () => {
      // Populate test files
      writeFileSync(
        path.join(memoryDir, 'index.md'),
        '---\nname: index\ndescription: Long-term\nscope: project\nupdatedAt: 2026-09-28T00:00:00.000Z\nupdatedBy: owner\n---\nProject conventions',
        'utf8'
      );

      const doc = await readMemory('index.md', { memoryDir });
      expect(doc).not.toBeNull();
      expect(doc?.content).toBe('Project conventions');

      const sessionContext = await startSession(
        { taskId: 'task-1', role: 'pm' },
        { memoryDir }
      );
      expect(sessionContext).toContain('## Project Conventions (index.md)');
      expect(sessionContext).toContain('Project conventions');
    });
  });
});
