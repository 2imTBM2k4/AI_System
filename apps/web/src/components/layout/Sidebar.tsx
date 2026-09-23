import React from 'react';
import {
  MessageSquarePlus,
  MessageSquare,
  Cpu,
  Layers,
  Puzzle,
  Settings,
  History,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import type { RunRecordDto } from '@squad/shared-types';
import type { ChatSession } from '../../lib/chatStorage';

export type ActiveView = 'chat' | 'providers' | 'agents' | 'extensions' | 'settings' | 'history';

interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  runs: RunRecordDto[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onNewPlan: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  chatSessions?: ChatSession[];
  activeSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  runs,
  selectedRunId,
  onSelectRun,
  onNewPlan,
  isCollapsed = false,
  onToggleCollapse,
  chatSessions = [],
  activeSessionId,
  onSelectSession,
  onDeleteSession,
}) => {
  const navItems: Array<{
    id: ActiveView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
  }> = [
    {
      id: 'chat',
      label: 'Chat Lập Kế Hoạch',
      icon: MessageSquarePlus,
    },
    {
      id: 'providers',
      label: 'Thiết Lập Nhà Cung Cấp Model',
      icon: Cpu,
    },
    {
      id: 'agents',
      label: 'Thiết Lập Agent',
      icon: Layers,
    },
    {
      id: 'extensions',
      label: 'Thiết Lập Skill & Plugin',
      icon: Puzzle,
    },
    {
      id: 'settings',
      label: 'Cài Đặt',
      icon: Settings,
    },
    {
      id: 'history',
      label: 'Lịch Sử Kế Hoạch Đã Thực Hiện',
      icon: History,
      badge: runs.length > 0 ? runs.length : undefined,
    },
  ];

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />;
      case 'completed':
        return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />;
      case 'failed':
        return <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />;
      default:
        return <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] shrink-0" />;
    }
  };

  return (
    <aside
      className={`border-r border-[var(--color-warm-mist)] bg-[var(--sidebar-bg)] flex flex-col shrink-0 h-[calc(100vh-3.5rem)] relative z-20 transition-all duration-300 ${
        isCollapsed ? 'w-18' : 'w-64'
      }`}
    >
      {/* Top Header of Sidebar */}
      <div className="p-3 border-b border-[var(--color-warm-mist)] flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-6 h-6 rounded-lg bg-[var(--color-deep-teal)] flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <span className="font-medium text-xs tracking-tight text-[var(--text-primary)] block truncate">
                Squad AI Orchestrator
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono block">Multi-Agent System</span>
            </div>
          </div>
        )}

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors cursor-pointer ${
              isCollapsed ? 'mx-auto' : ''
            }`}
            title={isCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Primary Action Button: + Kế hoạch mới */}
      <div className="p-3">
        <button
          type="button"
          onClick={onNewPlan}
          className={`w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--color-deep-teal)] hover:bg-[var(--color-deep-teal-hover)] active:scale-[0.98] text-white font-medium text-xs py-2 px-3 transition-all duration-150 cursor-pointer shadow-[var(--shadow-subtle)] ${
            isCollapsed ? 'p-2' : ''
          }`}
          title="Tạo Kế Hoạch Mới"
        >
          <MessageSquarePlus className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>+ Kế Hoạch Mới</span>}
        </button>
      </div>

      {/* Main Navigation Menu */}
      <div className="px-2.5 py-1.5 space-y-1">
        <div className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] font-mono ${isCollapsed ? 'hidden' : 'block'}`}>
          Chức Năng Chính
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-normal transition-all duration-150 cursor-pointer select-none text-left ${
                isActive
                  ? 'active-nav-item'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
              } ${isCollapsed ? 'justify-center px-2' : ''}`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[var(--text-secondary)]'}`} />
              {!isCollapsed && (
                <div className="flex-1 flex items-center justify-between truncate">
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-black/[0.05] dark:bg-white/[0.08] text-[var(--text-muted)]'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Chats and Tasks (Lịch sử chat) */}
      {!isCollapsed && (
        <div className="flex-1 flex flex-col min-h-0 pt-2 border-t border-[var(--color-warm-mist)]">
          {(() => {
            const validSessions = chatSessions.filter(
              (s) =>
                Boolean(s.runId) ||
                (s.messages && s.messages.some((m) => m.sender === 'user'))
            );

            return (
              <>
                <div className="px-4 py-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] font-mono">
                    Lịch Sử Chat ({validSessions.length})
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-0.5">
                  {validSessions.length === 0 ? (
                    <div className="text-center py-6 px-3 text-xs text-[var(--text-muted)] font-mono">
                      Chưa có cuộc trò chuyện nào
                    </div>
                  ) : (
                    validSessions.map((session) => {
                      const isSelected =
                        (session.id === activeSessionId && activeView === 'chat') ||
                        (session.runId && session.runId === selectedRunId && activeView === 'chat');
                      const linkedRun = session.runId ? runs.find((r) => r.id === session.runId) : null;

                      return (
                        <div
                          key={session.id}
                          onClick={() => {
                            if (session.runId && onSelectRun) {
                              onSelectRun(session.runId);
                            }
                            if (onSelectSession) {
                              onSelectSession(session.id);
                            }
                            onSelectView('chat');
                          }}
                          className={`group w-full text-left px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-between gap-2 text-xs select-none ${
                            isSelected
                              ? 'bg-[var(--color-deep-teal)]/10 text-[var(--color-deep-teal)] dark:text-teal-300 font-medium border border-[var(--color-deep-teal)]/30'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.03] dark:hover:bg-white/[0.03] border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate min-w-0">
                            {linkedRun ? (
                              getStatusDot(linkedRun.status)
                            ) : (
                              <MessageSquare className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                            )}
                            <span className="truncate text-[11px]" title={session.title}>
                              {session.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {onDeleteSession && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteSession(session.id);
                                }}
                                className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Xóa cuộc trò chuyện này"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                            {session.runId && (
                              <span className="font-mono text-[9px] text-[var(--text-muted)]">
                                #{session.runId.slice(0, 6)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Bottom Footer info */}
      {!isCollapsed && (
        <div className="p-2.5 border-t border-[var(--color-warm-mist)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono">
            <span>Squad Engine</span>
            <span>v0.1.0</span>
          </div>
        </div>
      )}
    </aside>
  );
};

