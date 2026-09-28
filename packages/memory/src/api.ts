import { readFile, unlink, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { MemoryDoc, MemoryFrontmatter, MemoryScope, MemoryParseError } from './types.js';
import { parseMemory, serializeMemory } from './parser.js';
import { resolveSafePath, atomicWrite, withFileLock } from './storage.js';
import { validateIdentifier } from './security.js';

/**
 * Options for memory operations.
 */
export interface MemoryOptions {
  /** Optional custom root directory. Defaults to SQUAD_MEMORY_DIR or <cwd>/.squad/memory */
  memoryDir?: string;
  /** Timeout in ms for acquiring file locks */
  lockTimeoutMs?: number;
}

/**
 * Options for writeMemory operations.
 */
export interface WriteMemoryOptions extends MemoryOptions {
  /** Optional agent attribution to verify role permissions */
  by?: string;
}

/**
 * Options for deleteMemory operations.
 */
export interface DeleteMemoryOptions extends MemoryOptions {
  /** Optional agent attribution to verify role permissions */
  by?: string;
}

/**
 * Normalized representation of a memory file path.
 */
export interface NormalizedMemoryPath {
  fullPath: string;
  relPath: string;
  lowerRelPath: string;
}

export interface AllowedWriteTarget {
  fullPath: string;
  relPath: string;
  collection?: 'decisions' | 'roles' | 'tasks';
  id?: string;
  isIndex: boolean;
}

/**
 * Validates target write path against the strict write allowlist:
 * (a) "index.md" (which is subsequently rejected as read-only)
 * (b) "<decisions|roles|tasks>/<id>.md" where directory is exact lowercase,
 *     <id> passes validateIdentifier [A-Za-z0-9_-] (max 64 chars), and extension is strictly ".md".
 *
 * Rejects any non-conforming shapes including:
 * - uppercase or mixed-case directory (Roles/pm.md, ROLES/pm.md)
 * - relative hops or dot segments (./roles/pm.md, roles/./pm.md, decisions/../x.md)
 * - backslashes (roles\pm.md)
 * - NTFS alternate data streams (roles/pm.md::$DATA)
 * - trailing dots or spaces ("index.md.", "index.md ", "roles/pm.md.")
 * - nested directories (decisions/a/b.md)
 * - arbitrary directories (notes/x.md)
 *
 * Real write operations strictly use the canonical path produced by this allowlist.
 */
export function validateWriteTarget(root: string, relPath: string): AllowedWriteTarget {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new Error(
      'Invalid memory write target: target path must be a non-empty string. Allowed targets are "index.md" or "<decisions|roles|tasks>/<id>.md".'
    );
  }

  // Reject NTFS alternate data streams, backslashes, leading/trailing whitespace, trailing dots, leading slashes
  if (
    relPath.includes('\\') ||
    relPath.includes('::$DATA') ||
    relPath.endsWith('.') ||
    relPath.endsWith(' ') ||
    relPath.startsWith(' ') ||
    relPath.startsWith('/')
  ) {
    throw new Error(
      `Invalid memory write target "${relPath}". Allowed targets are strictly "index.md" (read-only) or "<decisions|roles|tasks>/<id>.md" with lowercase directory, valid identifier [A-Za-z0-9_-], and exact ".md" extension.`
    );
  }

  // Shape (a): exact match "index.md"
  if (relPath === 'index.md') {
    const canonicalRelPath = 'index.md';
    return {
      fullPath: resolveSafePath(root, canonicalRelPath),
      relPath: canonicalRelPath,
      isIndex: true,
    };
  }

  // Shape (b): exact match "<decisions|roles|tasks>/<id>.md"
  const parts = relPath.split('/');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid memory write target "${relPath}". Allowed targets are strictly "index.md" (read-only) or "<decisions|roles|tasks>/<id>.md" with lowercase directory, valid identifier [A-Za-z0-9_-], and exact ".md" extension.`
    );
  }

  const [dir, filename] = parts;
  if (dir !== 'decisions' && dir !== 'roles' && dir !== 'tasks') {
    throw new Error(
      `Invalid memory write target "${relPath}". Directory "${dir}" is not permitted. Allowed directories are strictly "decisions", "roles", or "tasks".`
    );
  }

  if (!filename.endsWith('.md')) {
    throw new Error(
      `Invalid memory write target "${relPath}". File extension must be strictly ".md".`
    );
  }

  const id = filename.slice(0, -3);
  validateIdentifier(id, `${dir} id`);

  const canonicalRelPath = `${dir}/${id}.md`;
  return {
    fullPath: resolveSafePath(root, canonicalRelPath),
    relPath: canonicalRelPath,
    collection: dir,
    id,
    isIndex: false,
  };
}

/**
 * Enforces permission rules on writing/appending/deleting memory files:
 * 1. index.md is strictly read-only for agents.
 * 2. roles/<x>.md can only be modified when by == <x>.
 * 3. decisions/ and tasks/ are unrestricted with regard to --by.
 */
function enforceWritePermissions(
  target: AllowedWriteTarget,
  operation: 'write' | 'append' | 'delete',
  by?: string
): void {
  // Rule 1: index.md is read-only for agents
  if (target.isIndex) {
    throw new Error('index.md is read-only for agents; edit it manually');
  }

  // Rule 2: roles/<x>.md can only be modified when by == <x>
  if (target.collection === 'roles' && target.id) {
    if (!by || by.trim().length === 0) {
      throw new Error(`Agent identity (--by) is required to ${operation} role memory 'roles/${target.id}.md'`);
    }
    validateIdentifier(by, 'updatedBy / agent');
    const opText = operation === 'delete' ? 'delete' : `${operation} to`;
    if (by.toLowerCase() !== target.id.toLowerCase()) {
      throw new Error(
        `Permission denied: agent '${by}' cannot ${opText} 'roles/${target.id}.md'. Only role '${target.id}' is permitted.`
      );
    }
  }
}

/**
 * Metadata provided when appending a fact/line to a memory document.
 */
export interface AppendMeta {
  updatedBy: string;
  name?: string;
  description?: string;
  scope?: MemoryScope;
}

/**
 * Summary metadata for listed memory documents.
 */
export interface MemorySummary {
  path: string;
  name: string;
  description: string;
  scope: MemoryScope;
  updatedAt: string;
}

/**
 * Matched search result entry.
 */
export interface SearchResult {
  path: string;
  lineNumber: number;
  lineContent: string;
}

/**
 * Gets the root memory directory, resolving in order:
 * 1. Explicit override argument
 * 2. Process environment variable SQUAD_MEMORY_DIR
 * 3. Default fallback: path.resolve(process.cwd(), '.squad/memory')
 *
 * @param overrideDir - Optional custom directory path.
 * @returns Absolute path to memory root directory.
 */
export function getMemoryDir(overrideDir?: string): string {
  if (overrideDir && overrideDir.trim().length > 0) {
    return path.resolve(overrideDir);
  }
  if (process.env.SQUAD_MEMORY_DIR && process.env.SQUAD_MEMORY_DIR.trim().length > 0) {
    return path.resolve(process.env.SQUAD_MEMORY_DIR.trim());
  }
  return path.resolve(process.cwd(), '.squad/memory');
}

/**
 * Infers MemoryScope from relative file path convention:
 * - 'tasks/...' -> 'task'
 * - 'roles/...' -> 'role'
 * - 'index.md' or 'decisions/...' -> 'project'
 * Throws an error for non-standard paths if no explicit scope is provided.
 *
 * @param relPath - Relative file path.
 * @returns Inferred MemoryScope.
 * @throws Error if path cannot be mapped to a standard scope.
 */
export function inferScopeFromRelPath(relPath: string): MemoryScope {
  const normalized = relPath.replace(/\\/g, '/').toLowerCase();
  if (normalized.startsWith('tasks/')) return 'task';
  if (normalized.startsWith('roles/')) return 'role';
  if (normalized === 'index.md' || normalized.startsWith('decisions/')) return 'project';
  throw new Error(
    `Cannot infer memory scope for non-standard path '${relPath}'. Please provide explicit 'scope' metadata ('project' | 'role' | 'task').`
  );
}

/**
 * Formats a fact string to conform with memory markdown format (each non-empty fact line starting with '- ').
 * Supports inputs containing embedded newline characters.
 *
 * @param line - Raw line text (can contain newlines).
 * @returns Formatted fact lines joined by newline.
 */
function formatFactLine(line: string): string {
  const parts = line.split(/\r?\n/);
  const formattedParts = parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => (p.startsWith('- ') || p.startsWith('* ') ? p : `- ${p}`));

  return formattedParts.length > 0 ? formattedParts.join('\n') : `- ${line.trim()}`;
}

/**
 * Reads and parses a memory file. Returns null if the file does not exist.
 * Throws MemoryParseError if frontmatter is corrupt.
 *
 * @param relPath - Relative path to the memory file.
 * @param options - Memory options.
 * @returns MemoryDoc or null if non-existent.
 */
export async function readMemory(
  relPath: string,
  options?: MemoryOptions
): Promise<MemoryDoc | null> {
  const root = getMemoryDir(options?.memoryDir);
  const fullPath = resolveSafePath(root, relPath);

  if (!existsSync(fullPath)) {
    return null;
  }

  const raw = await readFile(fullPath, 'utf8');
  return parseMemory(raw, relPath);
}

/**
 * Writes or overwrites a memory file with the provided MemoryDoc.
 * Protected by atomic write and file lock.
 *
 * @param relPath - Relative path to the memory file.
 * @param doc - MemoryDoc to serialize and persist.
 * @param options - Memory options.
 */
export async function writeMemory(
  relPath: string,
  doc: MemoryDoc,
  options?: WriteMemoryOptions
): Promise<void> {
  const root = getMemoryDir(options?.memoryDir);
  const target = validateWriteTarget(root, relPath);
  const by = options?.by !== undefined ? options.by : doc.frontmatter.updatedBy;
  enforceWritePermissions(target, 'write', by);

  const raw = serializeMemory(doc);
  await withFileLock(
    target.fullPath,
    async () => {
      await atomicWrite(target.fullPath, raw);
    },
    { timeoutMs: options?.lockTimeoutMs }
  );
}

/**
 * Appends a line/fact to a memory file. If the file does not exist, creates it
 * with valid frontmatter. Updates updatedAt and updatedBy metadata.
 * Executes within an exclusive file lock to avoid read-modify-write race conditions.
 *
 * @param relPath - Relative path to the memory file.
 * @param line - Content line to append.
 * @param meta - Metadata for attribution and creation.
 * @param options - Memory options.
 */
export async function appendMemory(
  relPath: string,
  line: string,
  meta: AppendMeta,
  options?: MemoryOptions
): Promise<void> {
  const root = getMemoryDir(options?.memoryDir);
  const target = validateWriteTarget(root, relPath);
  enforceWritePermissions(target, 'append', meta.updatedBy);

  await withFileLock(
    target.fullPath,
    async () => {
      const nowIso = new Date().toISOString();
      let doc: MemoryDoc;

      if (existsSync(target.fullPath)) {
        const raw = await readFile(target.fullPath, 'utf8');
        doc = parseMemory(raw, target.relPath);

        // Update frontmatter metadata
        doc.frontmatter.updatedAt = nowIso;
        doc.frontmatter.updatedBy = meta.updatedBy;
        if (meta.name) doc.frontmatter.name = meta.name;
        if (meta.description) doc.frontmatter.description = meta.description;
        if (meta.scope) doc.frontmatter.scope = meta.scope;

        const fact = formatFactLine(line);
        const existingTrimmed = doc.content.trim();
        doc.content = existingTrimmed.length > 0 ? `${existingTrimmed}\n${fact}\n` : `\n${fact}\n`;
      } else {
        // Create initial document
        const baseName = path.basename(target.relPath, path.extname(target.relPath));
        const scope = meta.scope || inferScopeFromRelPath(target.relPath);
        const frontmatter: MemoryFrontmatter = {
          name: meta.name || baseName,
          description: meta.description || `Memory for ${baseName}`,
          scope,
          updatedAt: nowIso,
          updatedBy: meta.updatedBy,
        };

        const fact = formatFactLine(line);
        doc = {
          frontmatter,
          content: `\n${fact}\n`,
        };
      }

      const serialized = serializeMemory(doc);
      await atomicWrite(target.fullPath, serialized);
    },
    { timeoutMs: options?.lockTimeoutMs }
  );
}

/**
 * Recursively scans directory and returns all .md files.
 */
async function getMarkdownFilesRecursively(dir: string): Promise<string[]> {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await getMarkdownFilesRecursively(full);
      results.push(...sub);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.md') &&
      !entry.name.endsWith('.tmp') &&
      !entry.name.endsWith('.lock') &&
      !entry.name.startsWith('.')
    ) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Lists all memory files, returning their frontmatter summaries.
 * Skips and logs a warning for corrupted files rather than crashing.
 *
 * @param scope - Optional scope filter ('project' | 'role' | 'task').
 * @param options - Memory options.
 * @returns Array of MemorySummary items.
 */
export async function listMemories(
  scope?: MemoryScope,
  options?: MemoryOptions
): Promise<MemorySummary[]> {
  const root = getMemoryDir(options?.memoryDir);
  if (!existsSync(root)) {
    return [];
  }

  const filePaths = await getMarkdownFilesRecursively(root);
  const summaries: MemorySummary[] = [];

  for (const fullPath of filePaths) {
    const rel = path.relative(root, fullPath).replace(/\\/g, '/');
    try {
      const raw = await readFile(fullPath, 'utf8');
      const doc = parseMemory(raw, rel);

      if (!scope || doc.frontmatter.scope === scope) {
        summaries.push({
          path: rel,
          name: doc.frontmatter.name,
          description: doc.frontmatter.description,
          scope: doc.frontmatter.scope,
          updatedAt: doc.frontmatter.updatedAt,
        });
      }
    } catch (err: any) {
      console.warn(`[squad-mem warning] Skipping corrupted memory file '${rel}': ${err.message}`);
    }
  }

  // Sort by updatedAt descending
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Searches case-insensitively across memory documents body content.
 * Returns file path, 1-indexed line number, and matching line content.
 *
 * @param keyword - Substring to search for.
 * @param options - Memory options.
 * @returns Array of SearchResult items.
 */
export async function searchMemory(
  keyword: string,
  options?: MemoryOptions
): Promise<SearchResult[]> {
  if (!keyword || keyword.trim().length === 0) {
    return [];
  }

  const root = getMemoryDir(options?.memoryDir);
  if (!existsSync(root)) {
    return [];
  }

  const filePaths = await getMarkdownFilesRecursively(root);
  const results: SearchResult[] = [];
  const lowerKeyword = keyword.toLowerCase();

  for (const fullPath of filePaths) {
    const rel = path.relative(root, fullPath).replace(/\\/g, '/');
    try {
      const raw = await readFile(fullPath, 'utf8');
      const doc = parseMemory(raw, rel);

      const lines = doc.content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/\r$/, '');
        if (line.toLowerCase().includes(lowerKeyword)) {
          results.push({
            path: rel,
            lineNumber: i + 1,
            lineContent: line.trim(),
          });
        }
      }
    } catch {
      // Skip unparseable files during search
    }
  }

  return results;
}

/**
 * Deletes a memory file if it exists. Idempotent (does not throw if file does not exist).
 *
 * @param relPath - Relative path to the memory file to delete.
 * @param options - Memory options.
 */
export async function deleteMemory(
  relPath: string,
  options?: DeleteMemoryOptions
): Promise<void> {
  const root = getMemoryDir(options?.memoryDir);
  const target = validateWriteTarget(root, relPath);
  enforceWritePermissions(target, 'delete', options?.by);

  if (!existsSync(target.fullPath)) {
    return;
  }

  await withFileLock(
    target.fullPath,
    async () => {
      try {
        await unlink(target.fullPath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    },
    { timeoutMs: options?.lockTimeoutMs }
  );
}
