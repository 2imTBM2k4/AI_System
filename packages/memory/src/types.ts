/**
 * Memory scope types.
 * - 'project': Long-term memory shared across all agents/tasks (e.g. index.md, decisions/*.md)
 * - 'role': Role/persona specific learnings (e.g. roles/*.md)
 * - 'task': Short-term session state for a specific task (e.g. tasks/*.md)
 */
export type MemoryScope = 'project' | 'role' | 'task';

/**
 * Frontmatter metadata for every memory document.
 */
export interface MemoryFrontmatter {
  name: string;
  description: string;
  scope: MemoryScope;
  updatedAt: string;
  updatedBy: string;
}

/**
 * In-memory representation of a memory document.
 */
export interface MemoryDoc {
  frontmatter: MemoryFrontmatter;
  content: string;
}

/**
 * Custom error thrown when a memory file fails to parse or validate.
 */
export class MemoryParseError extends Error {
  constructor(message: string, public readonly filePath?: string) {
    const formatted = filePath ? `[${filePath}] ${message}` : message;
    super(formatted);
    this.name = 'MemoryParseError';
  }
}
