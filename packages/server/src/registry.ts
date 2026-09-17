import { randomUUID } from 'node:crypto';
import { access, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { repoRoot } from '@squad/core';

const REGISTRY_FILE = 'registry.db';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT,
    added_at TEXT NOT NULL
  );
`;

type SqlRow = Record<string, unknown>;

export interface RegisteredRepo {
  id: string;
  path: string;
  name: string | null;
  addedAt: string;
}

export interface RegisterRepoResult {
  repo: RegisteredRepo;
  created: boolean;
}

export class RegistryError extends Error {
  readonly code: 'REPO_PATH_INVALID' | 'REPO_NOT_INITIALIZED';

  constructor(code: RegistryError['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RegistryError';
    this.code = code;
  }
}

/** Returns the user-level Squad directory without coupling registry state to any repository. */
export function squadHome(env: NodeJS.ProcessEnv = process.env): string {
  const configuredHome = env.SQUAD_HOME?.trim();
  return resolve(configuredHome === undefined || configuredHome.length === 0
    ? join(homedir(), '.squad')
    : configuredHome);
}

/** SQLite registry that maps stable server IDs to local repository roots. */
export class RepoRegistry {
  private constructor(private readonly database: DatabaseSync) {
    this.database.exec(SCHEMA);
  }

  static async open(home = squadHome()): Promise<RepoRegistry> {
    await mkdir(home, { recursive: true });
    return new RepoRegistry(new DatabaseSync(join(home, REGISTRY_FILE)));
  }

  close(): void {
    this.database.close();
  }

  list(): RegisteredRepo[] {
    const rows = this.database.prepare('SELECT * FROM repos ORDER BY added_at, id').all();
    return rows.map((row) => toRegisteredRepo(row));
  }

  get(id: string): RegisteredRepo | undefined {
    const row = this.database.prepare('SELECT * FROM repos WHERE id = ?').get(id);
    return row === undefined ? undefined : toRegisteredRepo(row);
  }

  /** Validates a repository at the boundary, then safely registers it exactly once. */
  async register(inputPath: string): Promise<RegisterRepoResult> {
    const path = await validatedRepoRoot(inputPath);
    const existing = this.findByPath(path);
    if (existing !== undefined) {
      return { repo: existing, created: false };
    }

    const candidate: RegisteredRepo = {
      id: randomUUID(),
      path,
      name: basename(path),
      addedAt: new Date().toISOString(),
    };
    const inserted = this.database
      .prepare('INSERT OR IGNORE INTO repos (id, path, name, added_at) VALUES (?, ?, ?, ?)')
      .run(candidate.id, candidate.path, candidate.name, candidate.addedAt);
    if (Number(inserted.changes) === 1) {
      return { repo: candidate, created: true };
    }

    const concurrentRecord = this.findByPath(path);
    if (concurrentRecord === undefined) {
      throw new Error(`Registry could not load repository ${path} after registration.`);
    }
    return { repo: concurrentRecord, created: false };
  }

  private findByPath(path: string): RegisteredRepo | undefined {
    const row = this.database.prepare('SELECT * FROM repos WHERE path = ?').get(path);
    return row === undefined ? undefined : toRegisteredRepo(row);
  }
}

async function validatedRepoRoot(inputPath: string): Promise<string> {
  const absolutePath = resolve(inputPath);
  try {
    const details = await stat(absolutePath);
    if (!details.isDirectory()) {
      throw new RegistryError('REPO_PATH_INVALID', `Repository path is not a directory: ${absolutePath}`);
    }
  } catch (error) {
    if (error instanceof RegistryError) {
      throw error;
    }
    throw new RegistryError('REPO_PATH_INVALID', `Repository path does not exist: ${absolutePath}`, {
      cause: error,
    });
  }

  let root: string;
  try {
    root = resolve(await repoRoot(absolutePath));
  } catch (error) {
    throw new RegistryError('REPO_PATH_INVALID', `Repository path is not a Git work tree: ${absolutePath}`, {
      cause: error,
    });
  }

  try {
    await access(join(root, 'squad.config.json'));
  } catch (error) {
    throw new RegistryError(
      'REPO_NOT_INITIALIZED',
      `Repository is missing squad.config.json: ${root}. Run squad init first.`,
      { cause: error },
    );
  }
  return root;
}

function toRegisteredRepo(row: SqlRow): RegisteredRepo {
  if (
    typeof row.id !== 'string'
    || typeof row.path !== 'string'
    || (row.name !== null && typeof row.name !== 'string')
    || typeof row.added_at !== 'string'
  ) {
    throw new Error('Registry database returned an invalid repository row.');
  }
  return { id: row.id, path: row.path, name: row.name, addedAt: row.added_at };
}
