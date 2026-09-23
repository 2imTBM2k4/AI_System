import React from 'react';
import {
  MessageSquarePlus,
  Cpu,
  Layers,
  Puzzle,
  Settings,
  History,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { RunRecordDto } from '@squad/shared-types';

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
        return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]" />;
      case 'completed':
        return <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />;
      case 'failed':
        return <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />;
      default:
        return <span className="w-2 h-2 rounded-full bg-cyan-400" />;
    }
  };

  return (
    <aside
      className={`border-r border-black/[0.06] dark:border-white/[0.07] bg-white/70 dark:bg-zinc-950/60 backdrop-blur-2xl flex flex-col shrink-0 h-[calc(100vh-4rem)] relative z-20 transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Top Header of Sidebar */}
      <div className="p-3.5 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-500/20">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <span className="font-bold text-xs tracking-tight text-zinc-900 dark:text-zinc-100 block truncate">
                Squad AI Orchestrator
              </span>
              <span className="text-[10px] text-zinc-400 font-mono block">Multi-Agent System</span>
            </div>
          </div>
        )}

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors cursor-pointer ${
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
          className={`w-full flex items-center justify-center gap-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-medium text-xs py-2.5 px-3 transition-all duration-200 shadow-md shadow-indigo-600/25 cursor-pointer ${
            isCollapsed ? 'p-2.5' : ''
          }`}
          title="Tạo Kế Hoạch Mới"
        >
          <MessageSquarePlus className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>+ Kế Hoạch Mới</span>}
        </button>
      </div>

      {/* Main Navigation Menu */}
      <div className="px-3 py-2 space-y-1">
        <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono ${isCollapsed ? 'hidden' : 'block'}`}>
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer select-none text-left ${
                isActive
                  ? 'bg-indigo-500/[0.12] text-indigo-700 dark:text-indigo-300 border border-indigo-400/30 shadow-[0_2px_12px_rgba(99,102,241,0.1)]'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] border border-transparent'
              } ${isCollapsed ? 'justify-center px-2' : ''}`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
              {!isCollapsed && (
                <div className="flex-1 flex items-center justify-between truncate">
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-zinc-500 dark:text-zinc-400">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Recent Runs list in sidebar (ChatGPT style) */}
      {!isCollapsed && (
        <div className="flex-1 flex flex-col min-h-0 pt-2 border-t border-black/[0.06] dark:border-white/[0.06]">
          <div className="px-5 py-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
              Gần Đây ({runs.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
            {runs.length === 0 ? (
              <div className="text-center py-8 px-3 text-xs text-zinc-400 font-mono">
                Chưa có kế hoạch nào
              </div>
            ) : (
              runs.slice(0, 10).map((run) => {
                const isSelected = run.id === selectedRunId && activeView === 'history';
                const shortId = run.id.slice(0, 8);

                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      onSelectRun(run.id);
                      onSelectView('history');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl transition-all duration-150 cursor-pointer flex items-center justify-between gap-2.5 text-xs select-none ${
                      isSelected
                        ? 'bg-indigo-50/90 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 font-medium border border-indigo-400/30'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {getStatusDot(run.status)}
                      <span className="truncate text-[11px]">
                        {run.goal || `Run #${shortId}`}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                      #{shortId}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Bottom Footer info */}
      {!isCollapsed && (
        <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.01]">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
            <span>Squad Engine</span>
            <span>v0.1.0</span>
          </div>
        </div>
      )}
    </aside>
  );
};
