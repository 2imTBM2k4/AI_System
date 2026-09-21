import { useReducer, useEffect, useState, useCallback } from 'react';
import type {
  RunRecordDto,
  TaskRecordDto,
  TaskResultDto,
  RunDetailResponse,
  SquadEventDto,
  RunStatus,
} from '@squad/shared-types';
import { getRunDetail } from '../api/client';

export interface SquadState {
  run: RunRecordDto | null;
  tasks: Record<string, TaskRecordDto>;
  taskLogs: Record<string, string[]>;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

export type SquadAction =
  | { type: 'INIT_RUN' }
  | { type: 'SNAPSHOT_LOADED'; payload: RunDetailResponse }
  | { type: 'SSE_CONNECTED' }
  | { type: 'SSE_ERROR'; error: string }
  | { type: 'TASK_START'; taskId: string }
  | { type: 'TASK_LOG'; taskId: string; chunk: string }
  | { type: 'TASK_DONE'; result: TaskResultDto }
  | { type: 'RUN_DONE'; results: TaskResultDto[] }
  | { type: 'TASK_CANCELLED'; taskId: string }
  | { type: 'RESET' };

export const initialState: SquadState = {
  run: null,
  tasks: {},
  taskLogs: {},
  isLoading: false,
  isConnected: false,
  error: null,
};

/**
 * Kiểm tra xem Run đã kết thúc hoàn toàn hay chưa.
 * Giá trị kết thúc hợp lệ trong SQLite:
 * - endedAt !== null
 * - status thuộc nhóm terminal: 'completed', 'interrupted', 'failed'
 */
export function isRunEnded(run: { status: RunStatus | string; endedAt: string | null }): boolean {
  return (
    run.endedAt !== null ||
    ['completed', 'interrupted', 'failed'].includes(run.status)
  );
}

export function squadReducer(state: SquadState, action: SquadAction): SquadState {
  switch (action.type) {
    case 'RESET':
      return { ...initialState };

    case 'INIT_RUN':
      return {
        ...initialState,
        isLoading: true,
      };

    case 'SNAPSHOT_LOADED': {
      const taskMap: Record<string, TaskRecordDto> = {};
      for (const t of action.payload.tasks) {
        taskMap[t.id] = t;
      }
      if (action.payload.tasks.length === 0 && action.payload.run.plan?.tasks) {
        for (const t of action.payload.run.plan.tasks) {
          taskMap[t.id] = {
            id: t.id,
            runId: action.payload.run.id,
            title: t.title,
            role: t.role,
            status: 'pending',
            branch: t.branch,
            logPath: '',
            startedAt: null,
            endedAt: null,
            error: null,
            pid: null,
          };
        }
      }
      return {
        ...state,
        run: action.payload.run,
        tasks: taskMap,
        taskLogs: {}, // Làm sạch log của run trước khi nạp snapshot mới
        isLoading: false,
        error: null,
      };
    }

    case 'SSE_CONNECTED':
      return {
        ...state,
        isConnected: true,
        error: null,
      };

    case 'SSE_ERROR':
      return {
        ...state,
        isConnected: false,
        error: action.error,
      };

    case 'TASK_START': {
      const existing = state.tasks[action.taskId];
      if (!existing) return state;
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [action.taskId]: {
            ...existing,
            status: 'running',
            startedAt: existing.startedAt || new Date().toISOString(),
          },
        },
      };
    }

    case 'TASK_LOG': {
      const existingLogs = state.taskLogs[action.taskId] || [];
      return {
        ...state,
        taskLogs: {
          ...state.taskLogs,
          [action.taskId]: [...existingLogs, action.chunk],
        },
      };
    }

    case 'TASK_DONE': {
      const existing = state.tasks[action.result.id];
      const updatedTask: TaskRecordDto = existing
        ? {
            ...existing,
            status: action.result.status,
            endedAt: action.result.endedAt || new Date().toISOString(),
            error: action.result.error || null,
          }
        : {
            id: action.result.id,
            runId: state.run?.id || '',
            title: action.result.title,
            role: action.result.role,
            status: action.result.status,
            branch: action.result.branch,
            logPath: '',
            startedAt: action.result.startedAt,
            endedAt: action.result.endedAt || null,
            error: action.result.error || null,
            pid: null,
          };

      return {
        ...state,
        tasks: {
          ...state.tasks,
          [action.result.id]: updatedTask,
        },
      };
    }

    case 'RUN_DONE':
      return {
        ...state,
        run: state.run
          ? {
              ...state.run,
              status: 'completed',
              endedAt: new Date().toISOString(),
            }
          : null,
        isConnected: false,
      };

    case 'TASK_CANCELLED': {
      const existing = state.tasks[action.taskId];
      if (!existing) return state;
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [action.taskId]: {
            ...existing,
            status: 'cancelled',
            endedAt: new Date().toISOString(),
          },
        },
      };
    }

    default:
      return state;
  }
}

export function useSquadEvents(runId: string | null) {
  const [state, dispatch] = useReducer(squadReducer, initialState);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!runId) {
      dispatch({ type: 'RESET' });
      return;
    }

    let active = true;
    let eventSource: EventSource | null = null;
    const abortController = new AbortController();

    // Reset state và bật cờ loading cho run mới
    dispatch({ type: 'INIT_RUN' });

    // 1. Fetch snapshot REST trước (hiển thị board tức thì)
    getRunDetail(runId, abortController.signal)
      .then((detail) => {
        if (!active) return;
        dispatch({ type: 'SNAPSHOT_LOADED', payload: detail });

        // Chỉ mở SSE delta stream khi run đang thực sự chạy (status === 'running')
        // Tránh mở stream cho run đã kết thúc hoặc chỉ mới ở trạng thái planned
        if (detail.run.status !== 'running') {
          return;
        }

        // 2. Khởi tạo SSE Delta stream
        // Trình duyệt tự động kèm Last-Event-ID khi reconnect
        eventSource = new EventSource(`/runs/${encodeURIComponent(runId)}/events`);

        eventSource.onopen = () => {
          if (!active) return;
          dispatch({ type: 'SSE_CONNECTED' });
        };

        eventSource.onerror = () => {
          if (!active) return;
          // Nếu eventSource đã bị đóng chủ động, không báo lỗi
          if (eventSource && eventSource.readyState === EventSource.CLOSED) {
            return;
          }
          dispatch({
            type: 'SSE_ERROR',
            error: 'Mất kết nối stream SSE, trình duyệt đang tự động kết nối lại...',
          });
        };

        const handleMessage = (data: string) => {
          if (!active) return;
          try {
            const event: SquadEventDto = JSON.parse(data);
            switch (event.type) {
              case 'task:start':
                dispatch({ type: 'TASK_START', taskId: event.taskId });
                break;
              case 'task:log':
                dispatch({ type: 'TASK_LOG', taskId: event.taskId, chunk: event.chunk });
                break;
              case 'task:done':
                dispatch({ type: 'TASK_DONE', result: event.result });
                break;
              case 'run:done':
                dispatch({ type: 'RUN_DONE', results: event.results });
                if (eventSource) {
                  eventSource.close();
                }
                break;
            }
          } catch (err) {
            console.error('Lỗi phân tích SSE payload:', err);
          }
        };

        eventSource.onmessage = (e) => handleMessage(e.data);
        const sseEventTypes = ['run:start', 'task:start', 'task:log', 'task:done', 'run:done'];
        for (const type of sseEventTypes) {
          if (typeof eventSource.addEventListener === 'function') {
            eventSource.addEventListener(type, ((e: MessageEvent) => handleMessage(e.data)) as EventListener);
          }
        }
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        dispatch({
          type: 'SSE_ERROR',
          error: err instanceof Error ? err.message : 'Không thể nạp snapshot run',
        });
      });

    // Cleanup function đồng bộ trả về từ useEffect
    return () => {
      active = false;
      abortController.abort();
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [runId, refreshKey]);

  return {
    ...state,
    dispatch,
    refresh,
  };
}
