import type { PlanResponse, RunRecordDto } from '@squad/shared-types';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isPlanning?: boolean;
  plan?: PlanResponse;
  error?: string;
  runId?: string;
}

export interface ChatSession {
  id: string;
  repoId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  runId?: string | null;
  messages: ChatMessage[];
}

const STORAGE_KEY = 'squad_chat_sessions_v1';
const ACTIVE_SESSION_KEY = 'squad_active_chat_session_id';

export const WELCOME_MESSAGE: ChatMessage = {
  id: 'msg-welcome',
  sender: 'assistant',
  text: 'Xin chào! Tôi là **Squad Orchestrator**. Hãy mô tả mục tiêu bạn muốn thực hiện. Tôi sẽ phân rã mục tiêu thành các task song song độc lập và điều phối các agent chuyên trách (Backend, Frontend, Tester) thực thi cùng lúc.',
  timestamp: 'Vừa xong',
};

export function createNewSession(repoId: string | null = null, title = 'Cuộc trò chuyện mới'): ChatSession {
  const now = new Date().toISOString();
  return {
    id: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    repoId,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        ...WELCOME_MESSAGE,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ],
  };
}

export function loadAllSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load chat sessions from localStorage:', err);
    return [];
  }
}

export function saveAllSessions(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.error('Failed to save chat sessions to localStorage:', err);
  }
}

export function getActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setActiveSessionId(sessionId: string | null): void {
  try {
    if (sessionId) {
      localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function upsertSession(session: ChatSession): ChatSession[] {
  const sessions = loadAllSessions();
  const index = sessions.findIndex((s) => s.id === session.id);
  const updated: ChatSession = {
    ...session,
    updatedAt: new Date().toISOString(),
  };

  let newSessions: ChatSession[];
  if (index >= 0) {
    newSessions = [...sessions];
    newSessions[index] = updated;
  } else {
    newSessions = [updated, ...sessions];
  }

  // Sắp xếp mới nhất lên đầu
  newSessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  saveAllSessions(newSessions);
  return newSessions;
}

export function deleteSession(sessionId: string): ChatSession[] {
  const sessions = loadAllSessions();
  const newSessions = sessions.filter((s) => s.id !== sessionId);
  saveAllSessions(newSessions);
  if (getActiveSessionId() === sessionId) {
    setActiveSessionId(newSessions[0]?.id || null);
  }
  return newSessions;
}

/**
 * Tự động đồng bộ các run từ SQLite/server vào danh sách chat sessions nếu chưa có
 */
export function syncSessionsWithRuns(runs: RunRecordDto[], repoId: string | null): ChatSession[] {
  const sessions = loadAllSessions();
  let modified = false;

  for (const run of runs) {
    // Kiểm tra xem đã có session nào chứa run này chưa
    const exists = sessions.find((s) => s.runId === run.id || (run.goal && s.title === run.goal));
    if (!exists) {
      const timeStr = new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const msgs: ChatMessage[] = [
        {
          id: `usr-${run.id}`,
          sender: 'user',
          text: run.goal || `Kế hoạch #${run.id.slice(0, 8)}`,
          timestamp: timeStr,
        },
      ];

      if (run.plan) {
        msgs.push({
          id: `plan-${run.id}`,
          sender: 'assistant',
          text: `Đã phân rã mục tiêu thành ${run.plan.tasks.length} tasks song song độc lập.`,
          timestamp: timeStr,
          plan: {
            runId: run.id,
            plan: run.plan,
            warnings: [],
          },
          runId: run.id,
        });
      }

      sessions.push({
        id: `sess-run-${run.id}`,
        repoId: repoId || null,
        title: run.goal || `Kế hoạch #${run.id.slice(0, 8)}`,
        createdAt: run.createdAt,
        updatedAt: run.endedAt || run.createdAt,
        runId: run.id,
        messages: msgs,
      });
      modified = true;
    }
  }

  if (modified) {
    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    saveAllSessions(sessions);
  }

  return sessions;
}
