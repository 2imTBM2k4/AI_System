import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  writeMemory,
  appendMemory,
  deleteMemory,
  readMemory,
  MemoryDoc,
} from '../src/index.js';

describe('Strict Permission Enforcement & Case-Insensitive Path Normalization', () => {
  let memoryDir: string;

  beforeEach(() => {
    memoryDir = mkdtempSync(path.join(tmpdir(), 'squad-mem-perms-test-'));
  });

  afterEach(() => {
    if (existsSync(memoryDir)) {
      rmSync(memoryDir, { recursive: true, force: true });
    }
  });

  const dummyDoc: MemoryDoc = {
    frontmatter: {
      name: 'test',
      description: 'test doc',
      scope: 'project',
      updatedAt: new Date().toISOString(),
      updatedBy: 'pm',
    },
    content: 'Dummy content',
  };

  const indexVariants = [
    'index.md',
    'INDEX.md',
    './index.md',
    'decisions/../index.md',
    'decisions\\..\\index.md',
    '.\\index.md',
  ];

  describe('Rule 1: index.md is strictly read-only for agents (write, append, delete)', () => {
    for (const variant of indexVariants) {
      it(`rejects writeMemory on variant '${variant}'`, async () => {
        await expect(
          writeMemory(variant, dummyDoc, { memoryDir, by: 'pm' })
        ).rejects.toThrowError('index.md is read-only for agents; edit it manually');
      });

      it(`rejects appendMemory on variant '${variant}'`, async () => {
        await expect(
          appendMemory(variant, 'New fact', { updatedBy: 'pm' }, { memoryDir })
        ).rejects.toThrowError('index.md is read-only for agents; edit it manually');
      });

      it(`rejects deleteMemory on variant '${variant}'`, async () => {
        await expect(
          deleteMemory(variant, { memoryDir, by: 'pm' })
        ).rejects.toThrowError('index.md is read-only for agents; edit it manually');
      });
    }
  });

  const roleVariants = [
    'roles/pm.md',
    'Roles/pm.md',
    'ROLES/pm.md',
    'roles\\pm.md',
    './roles/pm.md',
    'roles/./pm.md',
    'decisions/../roles/pm.md',
    'decisions\\..\\roles\\pm.md',
  ];

  describe('Rule 2: roles/<x>.md can only be modified when by == <x>', () => {
    for (const variant of roleVariants) {
      describe(`Path variant: '${variant}'`, () => {
        it('allows writeMemory with correct --by (pm)', async () => {
          const doc: MemoryDoc = {
            frontmatter: {
              name: 'pm',
              description: 'PM notes',
              scope: 'role',
              updatedAt: new Date().toISOString(),
              updatedBy: 'pm',
            },
            content: 'PM content',
          };
          await writeMemory(variant, doc, { memoryDir, by: 'pm' });
          const readDoc = await readMemory('roles/pm.md', { memoryDir });
          expect(readDoc).not.toBeNull();
        });

        it('rejects writeMemory with incorrect --by (dev)', async () => {
          const doc: MemoryDoc = {
            frontmatter: {
              name: 'pm',
              description: 'PM notes',
              scope: 'role',
              updatedAt: new Date().toISOString(),
              updatedBy: 'dev',
            },
            content: 'Intruder content',
          };
          await expect(
            writeMemory(variant, doc, { memoryDir, by: 'dev' })
          ).rejects.toThrowError(/Permission denied: agent 'dev' cannot write to 'roles\/pm\.md'/);
        });

        it('allows appendMemory with correct --by (pm)', async () => {
          await appendMemory(variant, 'PM note entry', { updatedBy: 'pm' }, { memoryDir });
          const readDoc = await readMemory('roles/pm.md', { memoryDir });
          expect(readDoc).not.toBeNull();
          expect(readDoc!.content).toContain('PM note entry');
        });

        it('rejects appendMemory with incorrect --by (dev)', async () => {
          await expect(
            appendMemory(variant, 'Intruder fact', { updatedBy: 'dev' }, { memoryDir })
          ).rejects.toThrowError(/Permission denied: agent 'dev' cannot append to 'roles\/pm\.md'/);
        });

        it('allows deleteMemory with correct --by (pm)', async () => {
          // Create file first
          await appendMemory('roles/pm.md', 'To be deleted', { updatedBy: 'pm' }, { memoryDir });
          expect(await readMemory('roles/pm.md', { memoryDir })).not.toBeNull();

          // Delete with correct by
          await deleteMemory(variant, { memoryDir, by: 'pm' });
          expect(await readMemory('roles/pm.md', { memoryDir })).toBeNull();
        });

        it('rejects deleteMemory with incorrect --by (dev)', async () => {
          await expect(
            deleteMemory(variant, { memoryDir, by: 'dev' })
          ).rejects.toThrowError(/Permission denied: agent 'dev' cannot delete 'roles\/pm\.md'/);
        });
      });
    }
  });

  describe('Unrestricted paths: tasks/ and decisions/', () => {
    it('allows write, append, and delete on tasks/ and decisions/ regardless of --by', async () => {
      // 1. tasks/
      const taskDoc: MemoryDoc = {
        frontmatter: {
          name: 'task-100',
          description: 'task',
          scope: 'task',
          updatedAt: new Date().toISOString(),
          updatedBy: 'any-agent',
        },
        content: 'Task content',
      };
      await writeMemory('tasks/task-100.md', taskDoc, { memoryDir, by: 'any-agent' });
      await appendMemory('tasks/task-100.md', 'Task update', { updatedBy: 'another-agent' }, { memoryDir });
      expect(await readMemory('tasks/task-100.md', { memoryDir })).not.toBeNull();
      await deleteMemory('tasks/task-100.md', { memoryDir });
      expect(await readMemory('tasks/task-100.md', { memoryDir })).toBeNull();

      // 2. decisions/
      const decisionDoc: MemoryDoc = {
        frontmatter: {
          name: 'adr-01',
          description: 'adr',
          scope: 'project',
          updatedAt: new Date().toISOString(),
          updatedBy: 'developer',
        },
        content: 'ADR content',
      };
      await writeMemory('decisions/adr-01.md', decisionDoc, { memoryDir, by: 'developer' });
      await appendMemory('decisions/adr-01.md', 'ADR amendment', { updatedBy: 'architect' }, { memoryDir });
      expect(await readMemory('decisions/adr-01.md', { memoryDir })).not.toBeNull();
      await deleteMemory('decisions/adr-01.md', { memoryDir });
      expect(await readMemory('decisions/adr-01.md', { memoryDir })).toBeNull();
    });
  });
});
