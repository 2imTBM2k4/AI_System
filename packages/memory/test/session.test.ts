import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  startSession,
  endSession,
  appendMemory,
  readMemory,
  TRUNCATION_MARKER,
} from '../src/index.js';

describe('Session lifecycle helpers (T4)', () => {
  let memoryDir: string;

  beforeEach(() => {
    memoryDir = mkdtempSync(path.join(tmpdir(), 'squad-mem-session-test-'));
  });

  afterEach(() => {
    if (existsSync(memoryDir)) {
      rmSync(memoryDir, { recursive: true, force: true });
    }
  });

  it('returns index.md and role notes when task has no state yet', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      path.join(memoryDir, 'index.md'),
      `---\nname: index\ndescription: conventions\nscope: project\nupdatedAt: "2026-09-28T00:00:00.000Z"\nupdatedBy: owner\n---\n- Architecture Rule: All tests must be real\n`
    );
    await appendMemory('roles/frontend.md', 'Always use semantic HTML and CSS variables', { updatedBy: 'frontend' }, { memoryDir });

    const context = await startSession(
      { taskId: 'new-unseen-task', role: 'frontend' },
      { memoryDir }
    );

    expect(context).toContain('## Project Conventions (index.md)');
    expect(context).toContain('Architecture Rule: All tests must be real');
    expect(context).toContain('## Role Notes: frontend (roles/frontend.md)');
    expect(context).toContain('Always use semantic HTML and CSS variables');
    expect(context).not.toContain('## Task State');
  });

  it('runs smoothly when index.md does not exist, skipping that section', async () => {
    await appendMemory('roles/backend.md', 'Verify input parameters strictly', { updatedBy: 'backend' }, { memoryDir });
    await appendMemory('tasks/task-42.md', 'Initial database migration done', { updatedBy: 'backend' }, { memoryDir });

    const context = await startSession(
      { taskId: 'task-42', role: 'backend' },
      { memoryDir }
    );

    expect(context).not.toContain('## Project Conventions');
    expect(context).toContain('## Role Notes: backend');
    expect(context).toContain('Verify input parameters strictly');
    expect(context).toContain('## Task State: task-42');
    expect(context).toContain('Initial database migration done');
  });

  it('truncates oldest task state when exceeding maxChars, preserves index.md, and adds marker', async () => {
    const longProjectRule = 'CRITICAL RULE: NEVER OVERWRITE PRODUCTION DATABASE WITHOUT BACKUP!';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      path.join(memoryDir, 'index.md'),
      `---\nname: index\ndescription: conventions\nscope: project\nupdatedAt: "2026-09-28T00:00:00.000Z"\nupdatedBy: owner\n---\n- ${longProjectRule}\n`
    );

    // Generate large task history (old lines to new lines)
    const taskLines: string[] = [];
    for (let i = 1; i <= 200; i++) {
      taskLines.push(`Old line ${i}: detailed debug output for step ${i}`);
    }
    for (let i = 1; i <= 20; i++) {
      taskLines.push(`Brand new recent line ${i}: latest progress step ${i}`);
    }

    // Append into task file
    for (const line of taskLines) {
      await appendMemory('tasks/overflow-task.md', line, { updatedBy: 'agent' }, { memoryDir });
    }

    const maxCharsLimit = 1500;
    const context = await startSession(
      { taskId: 'overflow-task', role: 'worker', maxChars: maxCharsLimit },
      { memoryDir }
    );

    // 1. Must preserve index.md completely
    expect(context).toContain(longProjectRule);

    // 2. Must contain truncation marker
    expect(context).toContain(TRUNCATION_MARKER);

    // 3. Oldest lines must be truncated away
    expect(context).not.toContain('Old line 1: detailed debug output for step 1');

    // 4. Most recent lines must be kept
    expect(context).toContain('Brand new recent line 20: latest progress step 20');

    // 5. Total character length must stay within maxChars limit
    expect(context.length).toBeLessThanOrEqual(maxCharsLimit);
  }, 15_000);

  it('preserves previous entries when endSession is called multiple consecutive times', async () => {
    const taskId = 'task-iterative-99';

    // First session end
    await endSession(
      {
        taskId,
        role: 'gemini-agent',
        done: 'Scaffolded packages and basic types',
        remaining: 'Implement storage and lock',
      },
      { memoryDir }
    );

    // Second session end
    await endSession(
      {
        taskId,
        role: 'claude-agent',
        done: 'Implemented storage layer and unit tests',
        remaining: 'Implement CLI and docs',
      },
      { memoryDir }
    );

    const doc = await readMemory(`tasks/${taskId}.md`, { memoryDir });
    expect(doc).not.toBeNull();

    // Both records must exist in the file
    expect(doc!.content).toContain('Scaffolded packages and basic types');
    expect(doc!.content).toContain('Implement storage and lock');
    expect(doc!.content).toContain('Implemented storage layer and unit tests');
    expect(doc!.content).toContain('Implement CLI and docs');
    expect(doc!.content).toContain('gemini-agent');
    expect(doc!.content).toContain('claude-agent');
  });

  it('safely slices without splitting multi-byte emoji surrogate pairs into corrupt characters', async () => {
    // Rocket emoji is \uD83D\uDE80 (2 UTF-16 code units)
    const longTaskLine = 'A'.repeat(50) + '🚀' + 'B'.repeat(50);
    await appendMemory('tasks/emoji-task.md', longTaskLine, { updatedBy: 'agent' }, { memoryDir });

    // Request startSession with budget forcing truncation near the emoji
    const context = await startSession(
      { taskId: 'emoji-task', role: 'worker', maxChars: 120 },
      { memoryDir }
    );

    // Context must not contain orphaned replacement character \uFFFD
    expect(context.includes('\uFFFD')).toBe(false);
    expect(context).toContain(TRUNCATION_MARKER);
  });

  it('handles index.md alone exceeding maxChars by truncating index.md end per agreed decision', async () => {
    const hugeProjectConventions = 'Rule ' + 'X'.repeat(5000) + ' END_OF_RULES';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      path.join(memoryDir, 'index.md'),
      `---\nname: index\ndescription: conventions\nscope: project\nupdatedAt: "2026-09-28T00:00:00.000Z"\nupdatedBy: owner\n---\n- ${hugeProjectConventions}\n`
    );

    const maxCharsLimit = 500;
    const context = await startSession(
      { taskId: 'task-any', role: 'architect', maxChars: maxCharsLimit },
      { memoryDir }
    );

    expect(context).toContain('## Project Conventions (index.md)');
    expect(context).toContain('[... Truncated index.md exceeding maxChars ...]');
    expect(context.length).toBeLessThanOrEqual(maxCharsLimit);
  });

  describe('Task T7.0: Decisions Index & Hierarchical Truncation', () => {
    it('does not include Decisions Index when decisions/ directory does not exist or has no markdown files', async () => {
      await appendMemory('roles/dev.md', 'Dev note', { updatedBy: 'dev' }, { memoryDir });
      await appendMemory('tasks/t-1.md', 'Task note', { updatedBy: 'dev' }, { memoryDir });

      const context = await startSession({ taskId: 't-1', role: 'dev' }, { memoryDir });
      expect(context).not.toContain('## Decisions Index');
    });

    it('includes Decisions Index in exact section order: index.md -> roles/<role>.md -> Decisions index -> tasks/<taskId>.md', async () => {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      writeFileSync(
        path.join(memoryDir, 'index.md'),
        '---\nname: index\ndescription: d\nscope: project\nupdatedAt: "2026-09-28T00:00:00.000Z"\nupdatedBy: owner\n---\nProject Rule A'
      );
      await appendMemory('roles/qa.md', 'QA Rule B', { updatedBy: 'qa' }, { memoryDir });
      await appendMemory('decisions/d-01.md', 'Decision 1 details', { updatedBy: 'architect', name: 'd-01', description: 'Use PostgreSQL' }, { memoryDir });
      await appendMemory('decisions/d-02.md', 'Decision 2 details', { updatedBy: 'architect', name: 'd-02', description: 'Use GraphQL' }, { memoryDir });
      await appendMemory('tasks/run-1.md', 'Task State C', { updatedBy: 'qa' }, { memoryDir });

      // Add a .lock and a .tmp file to decisions directory to verify they are ignored
      writeFileSync(path.join(memoryDir, 'decisions', 'd-01.md.lock'), 'lock content');
      writeFileSync(path.join(memoryDir, 'decisions', '.d-temp.tmp'), 'tmp content');
      writeFileSync(path.join(memoryDir, 'decisions', 'corrupt.md'), 'not-yaml-frontmatter');

      const context = await startSession({ taskId: 'run-1', role: 'qa' }, { memoryDir });

      // Verify exact section order
      const idxPos = context.indexOf('## Project Conventions (index.md)');
      const rolePos = context.indexOf('## Role Notes: qa (roles/qa.md)');
      const decPos = context.indexOf('## Decisions Index');
      const taskPos = context.indexOf('## Task State: run-1 (tasks/run-1.md)');

      expect(idxPos).toBeGreaterThanOrEqual(0);
      expect(rolePos).toBeGreaterThan(idxPos);
      expect(decPos).toBeGreaterThan(rolePos);
      expect(taskPos).toBeGreaterThan(decPos);

      // Verify decision items
      expect(context).toContain('- d-01: Use PostgreSQL');
      expect(context).toContain('- d-02: Use GraphQL');
      expect(context).not.toContain('lock content');
      expect(context).not.toContain('tmp content');
      expect(context).not.toContain('corrupt');
    });

    it('truncates Decisions index from the end first before truncating task state when exceeding maxChars', async () => {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        path.join(memoryDir, 'index.md'),
        '---\nname: index\ndescription: d\nscope: project\nupdatedAt: "2026-09-28T00:00:00.000Z"\nupdatedBy: owner\n---\nProject convention'
      );
      await appendMemory('roles/dev.md', 'Role note', { updatedBy: 'dev' }, { memoryDir });

      // Create 5 decisions with emojis
      for (let i = 1; i <= 5; i++) {
        await appendMemory(
          `decisions/dec-0${i}.md`,
          `Decision detail ${i}`,
          { updatedBy: 'lead', name: `dec-0${i}`, description: `Decision number ${i} with emoji 🚀` },
          { memoryDir }
        );
      }

      const taskStateLine = 'Important task progress line that should be kept intact!';
      await appendMemory('tasks/t-truncate.md', taskStateLine, { updatedBy: 'dev' }, { memoryDir });

      // Budget that fits index + role + taskState + only first 2 decisions
      // Calculate length: index (~65), role (~45), task (~110), each decision line (~45).
      const maxChars = 340;
      const context = await startSession({ taskId: 't-truncate', role: 'dev', maxChars }, { memoryDir });

      expect(context.length).toBeLessThanOrEqual(maxChars);
      // index.md and role notes are preserved intact
      expect(context).toContain('Project convention');
      expect(context).toContain('Role note');
      // Task state was NOT truncated yet because removing decisions from the end was sufficient
      expect(context).toContain(taskStateLine);
      expect(context).not.toContain(TRUNCATION_MARKER);
      // Earlier decisions are kept, later decisions truncated from end
      expect(context).toContain('- dec-01:');
      expect(context).not.toContain('- dec-05:');
      // Verify no split emoji surrogate pairs
      expect(context.includes('\uFFFD')).toBe(false);
    });

    it('truncates oldest part of task state only after Decisions index has been truncated', async () => {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        path.join(memoryDir, 'index.md'),
        '---\nname: index\ndescription: d\nscope: project\nupdatedAt: "2026-09-28T00:00:00.000Z"\nupdatedBy: owner\n---\nShort index'
      );
      await appendMemory('roles/qa.md', 'Short role', { updatedBy: 'qa' }, { memoryDir });
      await appendMemory('decisions/d1.md', 'Dec', { updatedBy: 'lead', name: 'd1', description: 'Short dec' }, { memoryDir });

      // Very long task state
      for (let i = 1; i <= 30; i++) {
        await appendMemory('tasks/long-task.md', `Task line ${i} with emoji 🎯`, { updatedBy: 'qa' }, { memoryDir });
      }

      // Very small maxChars budget
      const maxChars = 220;
      const context = await startSession({ taskId: 'long-task', role: 'qa', maxChars }, { memoryDir });

      expect(context.length).toBeLessThanOrEqual(maxChars);
      expect(context).toContain(TRUNCATION_MARKER);
      expect(context.includes('\uFFFD')).toBe(false);
    });
  });
});
