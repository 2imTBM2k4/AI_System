import matter from 'gray-matter';
import { MemoryDoc, MemoryFrontmatter, MemoryParseError, MemoryScope } from './types.js';

const VALID_SCOPES: readonly MemoryScope[] = ['project', 'role', 'task'] as const;

/**
 * Validates frontmatter object and ensures all required fields are present and valid.
 *
 * @param data - The parsed frontmatter object from gray-matter.
 * @param filePath - Optional file path for error context.
 * @returns Validated MemoryFrontmatter.
 * @throws MemoryParseError if validation fails.
 */
function validateFrontmatter(data: Record<string, unknown>, filePath?: string): MemoryFrontmatter {
  if (!data || typeof data !== 'object') {
    throw new MemoryParseError('Frontmatter must be a YAML object', filePath);
  }

  const { name, description, scope, updatedAt, updatedBy } = data;

  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new MemoryParseError("Frontmatter missing or invalid required field: 'name' must be a non-empty string", filePath);
  }

  if (typeof description !== 'string') {
    throw new MemoryParseError("Frontmatter missing or invalid required field: 'description' must be a string", filePath);
  }

  if (typeof scope !== 'string' || !VALID_SCOPES.includes(scope as MemoryScope)) {
    throw new MemoryParseError(
      `Frontmatter missing or invalid 'scope': expected one of [${VALID_SCOPES.join(', ')}], received '${scope}'`,
      filePath
    );
  }

  if (typeof updatedAt !== 'string' || updatedAt.trim().length === 0 || isNaN(Date.parse(updatedAt))) {
    throw new MemoryParseError(
      "Frontmatter missing or invalid 'updatedAt': must be a valid ISO 8601 date string",
      filePath
    );
  }

  if (typeof updatedBy !== 'string' || updatedBy.trim().length === 0) {
    throw new MemoryParseError("Frontmatter missing or invalid required field: 'updatedBy' must be a non-empty string", filePath);
  }

  return {
    name: name.trim(),
    description,
    scope: scope as MemoryScope,
    updatedAt: updatedAt.trim(),
    updatedBy: updatedBy.trim(),
  };
}

/**
 * Parses a raw markdown string into a validated MemoryDoc.
 *
 * @param raw - Raw string content with frontmatter.
 * @param filePath - Optional file path used in error messages.
 * @returns MemoryDoc containing validated frontmatter and string content.
 * @throws MemoryParseError if YAML is invalid or missing required frontmatter fields.
 */
export function parseMemory(raw: string, filePath?: string): MemoryDoc {
  if (typeof raw !== 'string') {
    throw new MemoryParseError('Expected raw content to be a string', filePath);
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (error: any) {
    throw new MemoryParseError(`Failed to parse frontmatter YAML: ${error?.message || error}`, filePath);
  }

  // Check if raw actually had a frontmatter block
  const hasFrontmatterBlock = matter.test(raw);
  if (!hasFrontmatterBlock) {
    throw new MemoryParseError('File is missing YAML frontmatter block (--- ... ---)', filePath);
  }

  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    throw new MemoryParseError('Failed to parse frontmatter YAML: empty or malformed frontmatter', filePath);
  }

  const frontmatter = validateFrontmatter(parsed.data as Record<string, unknown>, filePath);

  return {
    frontmatter,
    content: parsed.content,
  };
}

/**
 * Serializes a MemoryDoc into a string with YAML frontmatter.
 *
 * @param doc - The MemoryDoc to serialize.
 * @returns Formatted string with frontmatter and content.
 */
export function serializeMemory(doc: MemoryDoc): string {
  const frontmatterData: Record<string, unknown> = {
    name: doc.frontmatter.name,
    description: doc.frontmatter.description,
    scope: doc.frontmatter.scope,
    updatedAt: doc.frontmatter.updatedAt,
    updatedBy: doc.frontmatter.updatedBy,
  };

  // gray-matter stringify handles prepending and formatting --- YAML delimiters
  return matter.stringify(doc.content, frontmatterData);
}
