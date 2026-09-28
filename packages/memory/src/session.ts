import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { readMemory, appendMemory, getMemoryDir, MemoryOptions } from './api.js';
import { parseMemory } from './parser.js';
import { validateIdentifier } from './security.js';

export interface StartSessionParams {
  taskId: string;
  role: string;
  /** Maximum character limit for output context. Defaults to 8000. */
  maxChars?: number;
}

export interface EndSessionParams {
  taskId: string;
  role: string;
  done: string;
  remaining: string;
}

export const TRUNCATION_MARKER = '[... Truncated older task history ...]';
export const INDEX_TRUNCATION_MARKER = '[... Truncated index.md exceeding maxChars ...]';

/**
 * Safely slices a string ensuring it does not split UTF-16 surrogate pairs (e.g. multi-byte emojis).
 *
 * @param str - The source string.
 * @param start - Start index.
 * @param end - Optional end index.
 * @returns Sliced string without split surrogate pairs.
 */
export function safeSlice(str: string, start: number, end?: number): string {
  let safeStart = Math.max(0, start);
  let safeEnd = end !== undefined ? Math.min(str.length, end) : str.length;

  // If safeStart falls on a low surrogate (0xDC00 - 0xDFFF), move back 1 unit to include the high surrogate
  if (safeStart > 0 && safeStart < str.length) {
    const code = str.charCodeAt(safeStart);
    if (code >= 0xDC00 && code <= 0xDFFF) {
      safeStart = safeStart - 1;
    }
  }

  // If safeEnd ends right after a high surrogate (0xD800 - 0xDBFF), move back 1 unit so we don't leave an orphaned high surrogate
  if (safeEnd > 0 && safeEnd < str.length) {
    const code = str.charCodeAt(safeEnd - 1);
    if (code >= 0xD800 && code <= 0xDBFF) {
      safeEnd = safeEnd - 1;
    }
  }

  return str.slice(safeStart, safeEnd);
}

/**
 * Loads and builds decisions index lines from decisions/*.md documents.
 * Skips .lock, .tmp, and corrupted files.
 */
async function loadDecisionsIndexLines(memoryDir?: string): Promise<string[]> {
  const root = getMemoryDir(memoryDir);
  const decisionsDir = path.join(root, 'decisions');
  if (!existsSync(decisionsDir)) {
    return [];
  }

  let entries: string[];
  try {
    entries = await readdir(decisionsDir);
  } catch {
    return [];
  }

  const mdFiles = entries
    .filter((f) => f.endsWith('.md') && !f.endsWith('.lock') && !f.endsWith('.tmp') && !f.startsWith('.'))
    .sort((a, b) => a.localeCompare(b));

  const lines: string[] = [];
  for (const file of mdFiles) {
    try {
      const fullPath = path.join(decisionsDir, file);
      const raw = await readFile(fullPath, 'utf8');
      const doc = parseMemory(raw, `decisions/${file}`);
      const name = doc.frontmatter.name?.trim() || path.basename(file, '.md');
      const desc = doc.frontmatter.description?.trim() || '';
      lines.push(`- ${name}: ${desc}`);
    } catch {
      // Ignore unparseable or corrupted decision files
    }
  }

  return lines;
}

/**
 * Builds the runtime context string for an agent starting a task.
 * Reads in order:
 * 1. index.md (project conventions)
 * 2. roles/<role>.md (role-specific learnings)
 * 3. Decisions index (decisions/*.md summary list)
 * 4. tasks/<taskId>.md (current task state)
 *
 * Enforces strict security validation on taskId and role.
 * When exceeding maxChars:
 * - If index.md alone exceeds maxChars: truncates the end of index.md with warning.
 * - Otherwise: truncates Decisions index (from the end) first;
 *   if still exceeding, truncates the oldest part of task state;
 *   preserves index.md and role notes intact.
 * - Prevents splitting emoji surrogate pairs.
 *
 * @param params - Start session parameters.
 * @param options - Memory options.
 * @returns Formatted context string.
 */
export async function startSession(
  params: StartSessionParams,
  options?: MemoryOptions
): Promise<string> {
  const taskId = validateIdentifier(params.taskId, 'taskId');
  const role = validateIdentifier(params.role, 'role');
  const maxChars = params.maxChars ?? 8000;

  // 1. Read index.md (long-term project memory)
  const indexDoc = await readMemory('index.md', options);
  let indexContent = indexDoc ? indexDoc.content.trim() : '';

  // Case: index.md alone exceeds maxChars
  const indexHeader = '## Project Conventions (index.md)\n';
  const totalIndexLen = indexHeader.length + indexContent.length;
  if (indexContent.length > 0 && totalIndexLen > maxChars) {
    process.stderr.write(
      `Warning: index.md exceeds maxChars limit (actual length: ${totalIndexLen} chars, maxChars: ${maxChars}). Truncating end of index.md.\n`
    );
    const budgetForIndex = maxChars - (indexHeader.length + INDEX_TRUNCATION_MARKER.length + 2);
    if (budgetForIndex > 0) {
      const truncatedIndex = safeSlice(indexContent, 0, budgetForIndex);
      return `${indexHeader}${truncatedIndex}\n${INDEX_TRUNCATION_MARKER}`;
    }
    return safeSlice(`${indexHeader}${INDEX_TRUNCATION_MARKER}`, 0, maxChars);
  }

  // 2. Read roles/<role>.md (role notes)
  const roleDoc = await readMemory(`roles/${role}.md`, options);
  const roleContent = roleDoc ? roleDoc.content.trim() : '';

  // 3. Read decisions index
  const decisionLines = await loadDecisionsIndexLines(options?.memoryDir);

  // 4. Read tasks/<taskId>.md (task session state)
  const taskDoc = await readMemory(`tasks/${taskId}.md`, options);
  let taskContent = taskDoc ? taskDoc.content.trim() : '';

  // Base permanent sections (index.md + roles/<role>.md)
  const permanentSections: string[] = [];
  if (indexContent.length > 0) {
    permanentSections.push(`${indexHeader}${indexContent}`);
  }
  if (roleContent.length > 0) {
    permanentSections.push(`## Role Notes: ${role} (roles/${role}.md)\n${roleContent}`);
  }

  const decisionsHeader = '## Decisions Index\n';
  const taskHeader = `## Task State: ${taskId} (tasks/${taskId}.md)\n`;

  // Helper to compose full text from candidate sections
  const compose = (decSec: string, tContent: string): string => {
    const parts = [...permanentSections];
    if (decSec.length > 0) parts.push(decSec);
    if (tContent.length > 0) parts.push(`${taskHeader}${tContent}`);
    return parts.join('\n\n');
  };

  const initialDecisionsSection = decisionLines.length > 0
    ? `${decisionsHeader}${decisionLines.join('\n')}`
    : '';

  let full = compose(initialDecisionsSection, taskContent);
  if (full.length <= maxChars) {
    return full;
  }

  // If exceeding maxChars:
  // Step 1: Truncate Decisions index (from the end) first
  let keptDecisionLines = [...decisionLines];
  let decisionsSection = initialDecisionsSection;

  while (keptDecisionLines.length > 0) {
    // If current full text exceeds maxChars, remove one decision line from the end
    if (compose(decisionsSection, taskContent).length <= maxChars) {
      break;
    }
    keptDecisionLines.pop();
    decisionsSection = keptDecisionLines.length > 0
      ? `${decisionsHeader}${keptDecisionLines.join('\n')}`
      : '';
  }

  full = compose(decisionsSection, taskContent);
  if (full.length <= maxChars) {
    return full;
  }

  // Step 2: If still exceeding, truncate oldest part of task state
  const prefixBeforeTask = compose(decisionsSection, '');
  const prefixLen = prefixBeforeTask.length > 0 ? prefixBeforeTask.length + 2 : 0; // +2 for '\n\n'
  const budgetForTask = maxChars - (prefixLen + taskHeader.length);

  if (budgetForTask > TRUNCATION_MARKER.length + 20 && taskContent.length > 0) {
    const allowedLength = budgetForTask - (TRUNCATION_MARKER.length + 2);
    const startIndex = taskContent.length - allowedLength;
    const keptTaskContent = safeSlice(taskContent, startIndex);
    taskContent = `${TRUNCATION_MARKER}\n${keptTaskContent}`;
  } else if (taskContent.length > 0) {
    taskContent = TRUNCATION_MARKER;
  }

  full = compose(decisionsSection, taskContent);
  if (full.length > maxChars) {
    return safeSlice(full, 0, maxChars);
  }

  return full;
}

/**
 * Persists session completion status to tasks/<taskId>.md.
 * Appends done and remaining items with attribution and timestamp.
 *
 * @param params - End session parameters.
 * @param options - Memory options.
 */
export async function endSession(
  params: EndSessionParams,
  options?: MemoryOptions
): Promise<void> {
  const taskId = validateIdentifier(params.taskId, 'taskId');
  const role = validateIdentifier(params.role, 'role');
  const timestamp = new Date().toISOString();

  const relPath = `tasks/${taskId}.md`;
  const summaryLine = `[Session End] (${timestamp}) By ${role} | Done: ${params.done.trim()} | Remaining: ${params.remaining.trim()}`;

  await appendMemory(
    relPath,
    summaryLine,
    {
      updatedBy: role,
      scope: 'task',
      description: `Task state for ${taskId}`,
    },
    options
  );
}
