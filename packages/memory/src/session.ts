import { readMemory, appendMemory, MemoryOptions } from './api.js';

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

/**
 * Builds the runtime context string for an agent starting a task.
 * Reads in order:
 * 1. index.md (project conventions)
 * 2. roles/<role>.md (role-specific learnings)
 * 3. tasks/<taskId>.md (current task state)
 *
 * If content exceeds maxChars, truncates the oldest part of the task state first,
 * while preserving index.md intact.
 *
 * @param params - Start session parameters.
 * @param options - Memory options.
 * @returns Formatted context string.
 */
export async function startSession(
  params: StartSessionParams,
  options?: MemoryOptions
): Promise<string> {
  const { taskId, role, maxChars = 8000 } = params;

  // 1. Read index.md (long-term project memory)
  const indexDoc = await readMemory('index.md', options);
  const indexContent = indexDoc ? indexDoc.content.trim() : '';

  // 2. Read roles/<role>.md (role notes)
  const roleDoc = await readMemory(`roles/${role}.md`, options);
  const roleContent = roleDoc ? roleDoc.content.trim() : '';

  // 3. Read tasks/<taskId>.md (task session state)
  const taskDoc = await readMemory(`tasks/${taskId}.md`, options);
  let taskContent = taskDoc ? taskDoc.content.trim() : '';

  const sections: string[] = [];

  if (indexContent.length > 0) {
    sections.push(`## Project Conventions (index.md)\n${indexContent}`);
  }

  if (roleContent.length > 0) {
    sections.push(`## Role Notes: ${role} (roles/${role}.md)\n${roleContent}`);
  }

  // Header prefix if any permanent sections exist
  const permanentPrefix = sections.length > 0 ? `${sections.join('\n\n')}\n\n` : '';
  const taskHeader = `## Task State: ${taskId} (tasks/${taskId}.md)\n`;

  // Calculate full prospective length
  const fullContextWithoutTruncation = taskContent.length > 0
    ? `${permanentPrefix}${taskHeader}${taskContent}`
    : permanentPrefix.trimEnd();

  if (fullContextWithoutTruncation.length <= maxChars) {
    return fullContextWithoutTruncation;
  }

  // Context exceeds maxChars. We must truncate the oldest part of the task state.
  // Allowed characters budget for the task content including marker
  const budgetForTask = maxChars - (permanentPrefix.length + taskHeader.length);

  if (budgetForTask > TRUNCATION_MARKER.length + 20 && taskContent.length > 0) {
    // Keep newest part (tail of taskContent)
    const allowedLength = budgetForTask - (TRUNCATION_MARKER.length + 2); // newline space
    const keptTaskContent = taskContent.slice(taskContent.length - allowedLength);
    taskContent = `${TRUNCATION_MARKER}\n${keptTaskContent}`;
  } else if (taskContent.length > 0) {
    // Budget is very tight, replace task content with truncation marker
    taskContent = TRUNCATION_MARKER;
  }

  const finalContext = `${permanentPrefix}${taskHeader}${taskContent}`;
  return finalContext;
}

/**
 * Persists session completion status to tasks/<taskId>.md.
 * Appends done and remaining items with attribution and timestamp,
 * ensuring consecutive calls preserve previous logs.
 *
 * @param params - End session parameters.
 * @param options - Memory options.
 */
export async function endSession(
  params: EndSessionParams,
  options?: MemoryOptions
): Promise<void> {
  const { taskId, role, done, remaining } = params;
  const timestamp = new Date().toISOString();

  const relPath = `tasks/${taskId}.md`;
  const summaryLine = `[Session End] (${timestamp}) By ${role} | Done: ${done.trim()} | Remaining: ${remaining.trim()}`;

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
