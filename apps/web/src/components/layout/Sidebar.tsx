import React from 'react';
import { History, Play, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import type { RunRecordDto } from '@squad/shared-types';

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
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full animate-pulse">
            <Play className="w-3 h-3 fill-amber-400" />
            running
          </span>
        );
      case 'completed':
      case 'passed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            done
          </span>
        );
      case 'failed':
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" />
            failed
          </span>
        );
      case 'planned':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" />
            planned
          </span>
        );
      default:
        return (
          <span className="text-[11px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
            {status}
          </span>
        );
    }
  };

  return (
    <aside className="w-72 border-r border-zinc-800/80 bg-zinc-900/40 flex flex-col shrink-0 h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-zinc-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Lịch sử Runs ({runs.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Làm mới lịch sử"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {runs.length === 0 ? (
          <div className="text-center py-10 px-4">
            <Clock className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
            <p className="text-xs text-zinc-400">Chưa có run nào trên repo này</p>
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
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-zinc-800/90 border-indigo-500/60 shadow-lg shadow-indigo-500/5'
                    : 'bg-zinc-900/50 border-zinc-800/60 hover:bg-zinc-800/50 hover:border-zinc-700/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-xs font-semibold text-zinc-300">
                    #{shortId}
                  </span>
                  {getStatusBadge(run.status)}
                </div>

                <p className="text-xs text-zinc-300 line-clamp-2 font-medium mb-2">
                  {run.goal || 'Không có mô tả mục tiêu'}
                </p>

                <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>{dateStr}</span>
                  {run.plan?.tasks && (
                    <span>{run.plan.tasks.length} tasks</span>
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
