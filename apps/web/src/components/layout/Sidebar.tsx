import React from 'react';
import { History, Play, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import type { RunRecordDto } from '@squad/shared-types';
import { GlassBadge } from '../glass/GlassBadge';

interface SidebarProps {
  runs: RunRecordDto[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onRefresh: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  runs,
  selectedRunId,
  onSelectRun,
  onRefresh,
}) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <GlassBadge variant="amber" dot pulse>
            <Play className="w-2.5 h-2.5 fill-amber-500 dark:fill-amber-400" />
            <span>running</span>
          </GlassBadge>
        );
      case 'completed':
      case 'passed':
        return (
          <GlassBadge variant="emerald" dot>
            <CheckCircle2 className="w-2.5 h-2.5" />
            <span>done</span>
          </GlassBadge>
        );
      case 'failed':
      case 'error':
        return (
          <GlassBadge variant="rose" dot>
            <XCircle className="w-2.5 h-2.5" />
            <span>failed</span>
          </GlassBadge>
        );
      case 'planned':
        return (
          <GlassBadge variant="cyan" dot>
            <Clock className="w-2.5 h-2.5" />
            <span>planned</span>
          </GlassBadge>
        );
      default:
        return (
          <GlassBadge variant="neutral">
            <span>{status}</span>
          </GlassBadge>
        );
    }
  };

  return (
    <aside className="w-72 border-r border-black/[0.06] dark:border-white/[0.07] bg-white/50 dark:bg-zinc-950/40 backdrop-blur-xl flex flex-col shrink-0 h-[calc(100vh-4rem)] relative z-20 transition-colors duration-200">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
            Lịch sử Runs ({runs.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="p-1.5 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all active:rotate-180 duration-300 cursor-pointer"
          title="Làm mới lịch sử"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Runs List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {runs.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-xl border border-dashed border-black/[0.08] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.01]">
            <Clock className="w-8 h-8 mx-auto text-zinc-400 dark:text-zinc-600 mb-2" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Chưa có run nào trên repo này</p>
          </div>
        ) : (
          runs.map((run) => {
            const isSelected = run.id === selectedRunId;
            const shortId = run.id.slice(0, 8);
            const dateStr = new Date(run.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelectRun(run.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden backdrop-blur-md select-none ${
                  isSelected
                    ? 'bg-indigo-50/90 dark:bg-indigo-500/[0.12] border-indigo-400 dark:border-indigo-500/50 shadow-[0_4px_20px_rgba(99,102,241,0.12)] ring-1 ring-indigo-500/30'
                    : 'bg-white/60 dark:bg-white/[0.025] border-black/[0.06] dark:border-white/[0.06] hover:bg-white/90 dark:hover:bg-white/[0.06] hover:border-black/15 dark:hover:border-white/[0.14]'
                }`}
              >
                {/* Specular edge for selected run card */}
                {isSelected && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 dark:via-indigo-300/40 to-transparent pointer-events-none"
                  />
                )}

                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-300">
                    #{shortId}
                  </span>
                  {getStatusBadge(run.status)}
                </div>

                <p className="text-xs text-zinc-800 dark:text-zinc-200 line-clamp-2 font-medium mb-2.5 leading-snug">
                  {run.goal || 'Không có mô tả mục tiêu'}
                </p>

                <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 font-mono pt-1 border-t border-black/[0.05] dark:border-white/[0.04]">
                  <span>{dateStr}</span>
                  {run.plan?.tasks && (
                    <span className="px-1.5 py-0.5 rounded bg-black/[0.03] dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 border border-black/[0.05] dark:border-white/[0.05]">
                      {run.plan.tasks.length} tasks
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
