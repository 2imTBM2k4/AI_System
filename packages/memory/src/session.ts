import { readMemory, appendMemory, MemoryOptions } from './api.js';
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
 * Builds the runtime context string for an agent starting a task.
 * Reads in order:
 * 1. index.md (project conventions)
 * 2. roles/<role>.md (role-specific learnings)
 * 3. tasks/<taskId>.md (current task state)
 *
 * Enforces strict security validation on taskId and role.
 * If content exceeds maxChars:
 * - If index.md alone exceeds maxChars: truncates the end of index.md per agreed decision.
 * - Otherwise: truncates the oldest part of the task state first, preserving index.md intact.
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
  if (indexContent.length > 0 && (indexHeader.length + indexContent.length) > maxChars) {
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

  // 3. Read tasks/<taskId>.md (task session state)
  const taskDoc = await readMemory(`tasks/${taskId}.md`, options);
  let taskContent = taskDoc ? taskDoc.content.trim() : '';

  const sections: string[] = [];

  if (indexContent.length > 0) {
    sections.push(`${indexHeader}${indexContent}`);
  }

  if (roleContent.length > 0) {
    sections.push(`## Role Notes: ${role} (roles/${role}.md)\n${roleContent}`);
  }

  const permanentPrefix = sections.length > 0 ? `${sections.join('\n\n')}\n\n` : '';
  const taskHeader = `## Task State: ${taskId} (tasks/${taskId}.md)\n`;

  const fullContext = taskContent.length > 0
    ? `${permanentPrefix}${taskHeader}${taskContent}`
    : permanentPrefix.trimEnd();

  if (fullContext.length <= maxChars) {
    return fullContext;
  }

  // Truncate oldest part of task state
  const budgetForTask = maxChars - (permanentPrefix.length + taskHeader.length);

  if (budgetForTask > TRUNCATION_MARKER.length + 20 && taskContent.length > 0) {
    const allowedLength = budgetForTask - (TRUNCATION_MARKER.length + 2);
    const startIndex = taskContent.length - allowedLength;
    const keptTaskContent = safeSlice(taskContent, startIndex);
    taskContent = `${TRUNCATION_MARKER}\n${keptTaskContent}`;
  } else if (taskContent.length > 0) {
    taskContent = TRUNCATION_MARKER;
  }

  return `${permanentPrefix}${taskHeader}${taskContent}`;
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
