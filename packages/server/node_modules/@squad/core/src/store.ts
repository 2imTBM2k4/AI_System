import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Plan, RunStatus, SquadEvent, Task, TaskResult } from './types.js';

type PersistedSquadEvent = Exclude<SquadEvent, { type: `plan:${string}` }>;

export interface RunRecord {
  id: string;
  repoPath: string;
  goal: string;
  plan: Plan | null;
  pid: number | null;
  status: RunStatus;
  createdAt: string;
  endedAt: string | null;
}

export interface TaskRecord {
  id: string;
  runId: string;
  title: string;
  role: string;
  status: string;
  branch: string;
  logPath: string;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
  pid: number | null;
}

export interface StoredEvent {
  id: number;
  runId: string;
  taskId: string | null;
  type: SquadEvent['type'];
  payload: SquadEvent;
  createdAt: string;
}

type SqlRow = Record<string, unknown>;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    repo_path TEXT NOT NULL,
    goal TEXT NOT NULL,
    plan_json TEXT,
    pid INTEGER,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    title TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    branch TEXT NOT NULL,
    log_path TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    error TEXT,
    pid INTEGER,
    PRIMARY KEY (id, run_id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    task_id TEXT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

const toStringValue = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new Error('SQLite returned an unexpected non-string value.');
  }

  return value;
};

const toNullableString = (value: unknown): string | null => {
  if (value === null) {
    return null;
  }

  return toStringValue(value);
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number') {
    throw new Error('SQLite returned an unexpected non-numeric value.');
  }
  return value;
};

const taskIdForEvent = (event: SquadEvent): string | null => {
  switch (event.type) {
    case 'plan:start':
    case 'plan:log':
    case 'plan:done':
      return null;
    case 'task:start':
    case 'task:log':
      return event.taskId;
    case 'task:done':
      return event.result.id;
    case 'run:start':
    case 'run:done':
      return null;
  }
};

/** SQLite-backed source of truth for runs, tasks, and replayable events. */
export class SquadStore {
  private constructor(private readonly database: DatabaseSync) {
    this.database.exec(SCHEMA);
    this.ensurePlanColumn();
    this.ensurePidColumns();
  }

  /** Opens a database, creating its parent directory when a file path is used. */
  static async open(dbFile: string): Promise<SquadStore> {
    if (dbFile !== ':memory:') {
      await mkdir(dirname(dbFile), { recursive: true });
    }

    return new SquadStore(new DatabaseSync(dbFile));
  }

  close(): void {
    this.database.close();
  }

  createPlannedRun(
    id: string,
    repoPath: string,
    plan: Plan,
    createdAt = new Date().toISOString(),
  ): void {
    this.database
      .prepare(
        `INSERT INTO runs (id, repo_path, goal, plan_json, pid, status, created_at, ended_at)
         VALUES (?, ?, ?, ?, NULL, 'planned', ?, NULL)`,
      )
      .run(id, repoPath, plan.goal, JSON.stringify(plan), createdAt);
  }

  startPlannedRun(
    id: string,
    plan: Plan,
    logPaths: ReadonlyMap<string, string>,
    event: Extract<SquadEvent, { type: 'run:start' }>,
    pid = process.pid,
    startedAt = new Date().toISOString(),
  ): void {
    this.transaction(() => {
      const update = this.database
        .prepare(`UPDATE runs SET status = 'running', pid = ?, ended_at = NULL WHERE id = ? AND status = 'planned'`)
        .run(pid, id);
      if (Number(update.changes) !== 1) {
        throw new Error(`Run ${id} does not exist or is not in planned status.`);
      }
      for (const task of plan.tasks) {
        const logPath = logPaths.get(task.id);
        if (logPath === undefined) {
          throw new Error(`Missing log path for task ${task.id}.`);
        }

        this.createTask(id, task, logPath);
      }
      this.appendEvent(event, startedAt);
    });
  }

  updateRunStatus(id: string, status: string, endedAt?: string): void {
    this.database
      .prepare('UPDATE runs SET status = ?, ended_at = ? WHERE id = ?')
      .run(status, endedAt ?? null, id);
  }

  createTask(runId: string, task: Task, logPath: string): void {
    this.database
      .prepare(
        `INSERT INTO tasks (
          id, run_id, title, role, status, branch, log_path, started_at, ended_at, error, pid
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, NULL, NULL, NULL)`,
      )
      .run(task.id, runId, task.title, task.role, task.branch, logPath);
  }

  markTaskRunning(runId: string, taskId: string, startedAt: string): void {
    this.database
      .prepare(
        `UPDATE tasks
         SET status = 'running', started_at = ?, ended_at = NULL, error = NULL
         WHERE id = ? AND run_id = ?`,
      )
      .run(startedAt, taskId, runId);
  }

  setTaskPid(runId: string, taskId: string, pid: number | null): void {
    this.database
      .prepare('UPDATE tasks SET pid = ? WHERE id = ? AND run_id = ?')
      .run(pid, taskId, runId);
  }

  recordTaskStarted(
    runId: string,
    taskId: string,
    startedAt: string,
    event: Extract<SquadEvent, { type: 'task:start' }>,
  ): void {
    this.transaction(() => {
      this.markTaskRunning(runId, taskId, startedAt);
      this.appendEvent(event, startedAt);
    });
  }

  saveTaskResult(runId: string, result: TaskResult): void {
    this.database
      .prepare(
        `UPDATE tasks
         SET status = ?, started_at = ?, ended_at = ?, error = ?, pid = NULL
         WHERE id = ? AND run_id = ?`,
      )
      .run(
        result.status,
        result.startedAt,
        result.endedAt ?? null,
        result.error ?? null,
        result.id,
        runId,
      );
  }

  recordTaskResult(
    runId: string,
    result: TaskResult,
    event: Extract<SquadEvent, { type: 'task:done' }>,
    createdAt = result.endedAt ?? new Date().toISOString(),
  ): void {
    this.transaction(() => {
      this.saveTaskResult(runId, result);
      this.appendEvent(event, createdAt);
    });
  }

  appendEvent(event: PersistedSquadEvent, createdAt = new Date().toISOString()): void {
    this.database
      .prepare(
        `INSERT INTO events (run_id, task_id, type, payload, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(event.runId, taskIdForEvent(event), event.type, JSON.stringify(event), createdAt);
  }

  completeRun(
    runId: string,
    status: string,
    results: TaskResult[],
    endedAt = new Date().toISOString(),
  ): void {
    const event: Extract<SquadEvent, { type: 'run:done' }> = {
      type: 'run:done',
      runId,
      results,
    };

    this.transaction(() => {
      this.database
        .prepare('UPDATE runs SET status = ?, ended_at = ?, pid = NULL WHERE id = ?')
        .run(status, endedAt, runId);
      this.appendEvent(event, endedAt);
    });
  }

  getRun(id: string): RunRecord | undefined {
    const row = this.database.prepare('SELECT * FROM runs WHERE id = ?').get(id);
    return row === undefined ? undefined : this.toRunRecord(row);
  }

  getRunPlan(id: string): Plan | undefined {
    const row = this.database.prepare('SELECT plan_json FROM runs WHERE id = ?').get(id);
    if (row === undefined || row.plan_json === null) {
      return undefined;
    }

    return JSON.parse(toStringValue(row.plan_json)) as Plan;
  }

  listTasks(runId: string): TaskRecord[] {
    const rows = this.database
      .prepare('SELECT * FROM tasks WHERE run_id = ? ORDER BY started_at, id')
      .all(runId);
    return rows.map((row) => this.toTaskRecord(row));
  }

  /** Lists newest runs first for the CLI history view. */
  listRuns(limit: number): RunRecord[] {
    const rows = this.database
      .prepare('SELECT * FROM runs ORDER BY created_at DESC, id DESC LIMIT ?')
      .all(limit);
    return rows.map((row) => this.toRunRecord(row));
  }

  listRunningRuns(): RunRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM runs WHERE status = 'running' ORDER BY created_at, id")
      .all();
    return rows.map((row) => this.toRunRecord(row));
  }

  /** Marks only unfinished work as interrupted after its coordinator process has disappeared. */
  interruptRun(runId: string, endedAt = new Date().toISOString()): boolean {
    let interrupted = false;
    this.transaction(() => {
      const updatedRun = this.database
        .prepare("UPDATE runs SET status = 'interrupted', ended_at = ?, pid = NULL WHERE id = ? AND status = 'running'")
        .run(endedAt, runId);
      if (Number(updatedRun.changes) !== 1) {
        return;
      }
      this.database
        .prepare(
          "UPDATE tasks SET status = 'interrupted', ended_at = ?, error = ?, pid = NULL WHERE run_id = ? AND status IN ('running', 'pending')",
        )
        .run(endedAt, 'Run coordinator process was no longer alive.', runId);
      interrupted = true;
    });
    return interrupted;
  }

  /** Lists task records from every run without modifying historical state. */
  listAllTasks(): TaskRecord[] {
    const rows = this.database
      .prepare('SELECT * FROM tasks ORDER BY run_id, started_at, id')
      .all();
    return rows.map((row) => this.toTaskRecord(row));
  }

  listEvents(runId: string): StoredEvent[] {
    const rows = this.database
      .prepare('SELECT * FROM events WHERE run_id = ? ORDER BY id')
      .all(runId);
    return rows.map((row) => this.toStoredEvent(row));
  }

  /** Queries only events with an id strictly greater than afterId for robust replay-to-live SSE handoff. */
  listEventsAfter(runId: string, afterId: number): StoredEvent[] {
    const rows = this.database
      .prepare('SELECT * FROM events WHERE run_id = ? AND id > ? ORDER BY id')
      .all(runId, afterId);
    return rows.map((row) => this.toStoredEvent(row));
  }

  private toRunRecord(row: SqlRow): RunRecord {
    return {
      id: toStringValue(row.id),
      repoPath: toStringValue(row.repo_path),
      goal: toStringValue(row.goal),
      plan: row.plan_json === null ? null : (JSON.parse(toStringValue(row.plan_json)) as Plan),
      pid: toNullableNumber(row.pid),
      status: toStringValue(row.status) as RunStatus,
      createdAt: toStringValue(row.created_at),
      endedAt: toNullableString(row.ended_at),
    };
  }

  private toTaskRecord(row: SqlRow): TaskRecord {
    return {
      id: toStringValue(row.id),
      runId: toStringValue(row.run_id),
      title: toStringValue(row.title),
      role: toStringValue(row.role),
      status: toStringValue(row.status),
      branch: toStringValue(row.branch),
      logPath: toStringValue(row.log_path),
      startedAt: toNullableString(row.started_at),
      endedAt: toNullableString(row.ended_at),
      error: toNullableString(row.error),
      pid: toNullableNumber(row.pid),
    };
  }

  private toStoredEvent(row: SqlRow): StoredEvent {
    const id = row.id;
    if (typeof id !== 'number') {
      throw new Error('SQLite returned an unexpected non-numeric event id.');
    }

    return {
      id,
      runId: toStringValue(row.run_id),
      taskId: toNullableString(row.task_id),
      type: toStringValue(row.type) as SquadEvent['type'],
      payload: JSON.parse(toStringValue(row.payload)) as SquadEvent,
      createdAt: toStringValue(row.created_at),
    };
  }

  private transaction(action: () => void): void {
    this.database.exec('BEGIN');
    try {
      action();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private ensurePlanColumn(): void {
    const columns = this.database.prepare('PRAGMA table_info(runs)').all();
    const hasPlanColumn = columns.some((column) => column.name === 'plan_json');
    if (!hasPlanColumn) {
      this.database.exec('ALTER TABLE runs ADD COLUMN plan_json TEXT');
    }
  }

  private ensurePidColumns(): void {
    this.ensureColumn('runs', 'pid');
    this.ensureColumn('tasks', 'pid');
  }

  private ensureColumn(table: 'runs' | 'tasks', columnName: 'pid'): void {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all();
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
      this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${columnName} INTEGER`);
    }
  }
}
