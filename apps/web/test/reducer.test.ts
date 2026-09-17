import { describe, it, expect } from 'vitest';
import { squadReducer, initialState, isRunEnded } from '../src/hooks/useSquadEvents';
import type {
  RunRecordDto,
  TaskRecordDto,
  TaskResultDto,
  RunDetailResponse,
} from '@squad/shared-types';

describe('squadReducer pure state transitions', () => {
  const dummyRun: RunRecordDto = {
    id: 'run-123',
    repoPath: '/path/to/repo',
    goal: 'Test goal',
    plan: null,
    pid: 1234,
    status: 'running',
    createdAt: '2026-09-17T10:00:00.000Z',
    endedAt: null,
  };

  const dummyTask1: TaskRecordDto = {
    id: 't1',
    runId: 'run-123',
    title: 'Setup Database',
    role: 'backend',
    status: 'pending',
    branch: 'squad/t1-db',
    logPath: '',
    startedAt: null,
    endedAt: null,
    error: null,
    pid: null,
  };

  const dummyTask2: TaskRecordDto = {
    id: 't2',
    runId: 'run-123',
    title: 'Setup UI',
    role: 'frontend',
    status: 'pending',
    branch: 'squad/t2-ui',
    logPath: '',
    startedAt: null,
    endedAt: null,
    error: null,
    pid: null,
  };

  it('SNAPSHOT_LOADED converts task array to dictionary and resets taskLogs from prior run', () => {
    // State with lingering logs from an old run
    const stateWithOldLogs = {
      ...initialState,
      taskLogs: { t0: ['old log chunk 1', 'old log chunk 2'] },
      isLoading: true,
    };

    const payload: RunDetailResponse = {
      run: dummyRun,
      tasks: [dummyTask1, dummyTask2],
    };

    const nextState = squadReducer(stateWithOldLogs, {
      type: 'SNAPSHOT_LOADED',
      payload,
    });

    expect(nextState.run).toEqual(dummyRun);
    expect(Object.keys(nextState.tasks)).toEqual(['t1', 't2']);
    expect(nextState.tasks.t1).toEqual(dummyTask1);
    expect(nextState.tasks.t2).toEqual(dummyTask2);
    // Old logs must be cleanly wiped
    expect(nextState.taskLogs).toEqual({});
    expect(nextState.isLoading).toBe(false);
    expect(nextState.error).toBeNull();
  });

  it('TASK_LOG accumulates multiple chunks sequentially without overwriting or clobbering other tasks', () => {
    let state = squadReducer(initialState, {
      type: 'SNAPSHOT_LOADED',
      payload: { run: dummyRun, tasks: [dummyTask1, dummyTask2] },
    });

    // Chunk 1 for t1
    state = squadReducer(state, {
      type: 'TASK_LOG',
      taskId: 't1',
      chunk: 'Compiling typescript...\n',
    });
    // Chunk 2 for t1
    state = squadReducer(state, {
      type: 'TASK_LOG',
      taskId: 't1',
      chunk: 'Running migration...\n',
    });
    // Chunk 1 for t2
    state = squadReducer(state, {
      type: 'TASK_LOG',
      taskId: 't2',
      chunk: 'Vite build started\n',
    });

    expect(state.taskLogs.t1).toEqual([
      'Compiling typescript...\n',
      'Running migration...\n',
    ]);
    expect(state.taskLogs.t2).toEqual(['Vite build started\n']);
  });

  it('TASK_START updates task status to running and sets startedAt', () => {
    let state = squadReducer(initialState, {
      type: 'SNAPSHOT_LOADED',
      payload: { run: dummyRun, tasks: [dummyTask1] },
    });

    state = squadReducer(state, { type: 'TASK_START', taskId: 't1' });
    expect(state.tasks.t1.status).toBe('running');
    expect(state.tasks.t1.startedAt).toBeTruthy();
  });

  it('TASK_DONE updates task with final status, endedAt and error info', () => {
    let state = squadReducer(initialState, {
      type: 'SNAPSHOT_LOADED',
      payload: { run: dummyRun, tasks: [dummyTask1] },
    });

    const result: TaskResultDto = {
      id: 't1',
      title: dummyTask1.title,
      role: dummyTask1.role,
      files: ['src/db.ts'],
      dependsOn: [],
      prompt: 'do db',
      branch: dummyTask1.branch,
      status: 'passed',
      log: 'done',
      startedAt: '2026-09-17T10:01:00.000Z',
      endedAt: '2026-09-17T10:02:00.000Z',
    };

    state = squadReducer(state, { type: 'TASK_DONE', result });
    expect(state.tasks.t1.status).toBe('passed');
    expect(state.tasks.t1.endedAt).toBe('2026-09-17T10:02:00.000Z');
    expect(state.tasks.t1.error).toBeNull();
  });

  it('RUN_DONE updates run status and does not crash when tasks or run are empty', () => {
    // With empty tasks and null run
    const emptyState = squadReducer(initialState, {
      type: 'RUN_DONE',
      results: [],
    });
    expect(emptyState.run).toBeNull();
    expect(emptyState.isConnected).toBe(false);

    // With active run
    let activeState = squadReducer(initialState, {
      type: 'SNAPSHOT_LOADED',
      payload: { run: dummyRun, tasks: [] },
    });
    activeState = squadReducer(activeState, {
      type: 'RUN_DONE',
      results: [],
    });
    expect(activeState.run?.status).toBe('completed');
    expect(activeState.run?.endedAt).toBeTruthy();
    expect(activeState.isConnected).toBe(false);
  });

  it('INIT_RUN resets state and turns on isLoading flag', () => {
    const dirtyState = {
      ...initialState,
      run: dummyRun,
      tasks: { t1: dummyTask1 },
      taskLogs: { t1: ['logs'] },
      isLoading: false,
    };

    const state = squadReducer(dirtyState, { type: 'INIT_RUN' });
    expect(state.run).toBeNull();
    expect(state.tasks).toEqual({});
    expect(state.taskLogs).toEqual({});
    expect(state.isLoading).toBe(true);
  });
});

describe('isRunEnded terminal status verification', () => {
  it('returns true when endedAt is not null regardless of status', () => {
    expect(isRunEnded({ status: 'running', endedAt: '2026-09-17T10:05:00.000Z' })).toBe(true);
    expect(isRunEnded({ status: 'planned', endedAt: '2026-09-17T10:05:00.000Z' })).toBe(true);
  });

  it('returns true for terminal run statuses: completed, interrupted, failed', () => {
    expect(isRunEnded({ status: 'completed', endedAt: null })).toBe(true);
    expect(isRunEnded({ status: 'interrupted', endedAt: null })).toBe(true);
    expect(isRunEnded({ status: 'failed', endedAt: null })).toBe(true);
  });

  it('returns false for active run statuses: running, planned when endedAt is null', () => {
    expect(isRunEnded({ status: 'running', endedAt: null })).toBe(false);
    expect(isRunEnded({ status: 'planned', endedAt: null })).toBe(false);
  });
});
