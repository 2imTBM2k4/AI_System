import React, { useState } from 'react';
import {
  History,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  ArrowLeft,
  Calendar,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type { RunRecordDto, TaskRecordDto } from '@squad/shared-types';
import { KanbanBoard } from '../dashboard/KanbanBoard';
import { GlassBadge } from '../glass/GlassBadge';
import { GlassButton } from '../glass/GlassButton';

interface HistoryViewProps {
  runs: RunRecordDto[];
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
  onRefresh: () => void;
  repoId?: string;
  // Detail state for selected run
  viewingRun: RunRecordDto | null;
  viewingTasks: Record<string, TaskRecordDto>;
  viewingLogs: Record<string, string[]>;
  isRunLoading?: boolean;
  runError: string | null;
  onTaskCancelled: (taskId: string) => void;
  onRunStarted: (runId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  runs,
  selectedRunId,
  onSelectRun,
  onRefresh,
  repoId,
  viewingRun,
  viewingTasks,
  viewingLogs,
  runError,
  onTaskCancelled,
  onRunStarted,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'done' | 'failed'>('all');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <GlassBadge variant="amber" dot pulse>
            <Play className="w-2.5 h-2.5 fill-amber-500" />
            <span>Đang chạy</span>
          </GlassBadge>
        );
      case 'completed':
        return (
          <GlassBadge variant="emerald" dot>
            <CheckCircle2 className="w-2.5 h-2.5" />
            <span>Hoàn thành</span>
          </GlassBadge>
        );
      case 'failed':
      case 'interrupted':
        return (
          <GlassBadge variant="rose" dot>
            <XCircle className="w-2.5 h-2.5" />
            <span>Thất bại</span>
          </GlassBadge>
        );
      case 'planned':
        return (
          <GlassBadge variant="cyan" dot>
            <Clock className="w-2.5 h-2.5" />
            <span>Kế hoạch</span>
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

  const filteredRuns = runs.filter((run) => {
    const matchesSearch =
      run.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (run.goal && run.goal.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'running') return run.status === 'running';
    if (statusFilter === 'done') return run.status === 'completed';
    if (statusFilter === 'failed') return run.status === 'failed' || run.status === 'interrupted';
    return true;
  });

  // If a run is selected, render its full Kanban Detail
  if (selectedRunId && viewingRun) {
    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Back navigation header */}
        <div className="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center gap-3">
            <GlassButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onSelectRun(null)}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay Lại Danh Sách Lịch Sử</span>
            </GlassButton>
            <div className="h-5 w-px bg-black/[0.08] dark:border-white/[0.08]" />
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Run #{viewingRun.id.slice(0, 8)}
              </span>
              {getStatusBadge(viewingRun.status)}
            </div>
          </div>

          <GlassButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            title="Làm mới trạng thái run"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Làm mới</span>
          </GlassButton>
        </div>

        {runError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
            {runError}
          </div>
        )}

        {/* Full Kanban Board */}
        <KanbanBoard
          run={viewingRun}
          tasks={viewingTasks}
          taskLogs={viewingLogs}
          repoId={repoId}
          onTaskCancelled={onTaskCancelled}
          onRunStarted={onRunStarted}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/20">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Lịch Sử Kế Hoạch &amp; Các Lần Thực Thi (Runs)
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Theo dõi chi tiết các kế hoạch đã tạo, trạng thái các task phân rã, kết quả kiểm thử và log điều phối.
            </p>
          </div>
        </div>

        <GlassButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRefresh}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Làm Mới Lịch Sử</span>
        </GlassButton>
      </div>

      {/* Filter and search bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Tìm theo mã Run ID hoặc nội dung mục tiêu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="liquid-glass-input w-full rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none"
          />
        </div>

        {/* Status filters */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            Tất cả ({runs.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('running')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              statusFilter === 'running'
                ? 'bg-white dark:bg-zinc-800 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            Đang chạy
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('done')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              statusFilter === 'done'
                ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            Hoàn thành
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('failed')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              statusFilter === 'failed'
                ? 'bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            Thất bại
          </button>
        </div>
      </div>

      {/* Runs List */}
      {filteredRuns.length === 0 ? (
        <div className="p-12 rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-center space-y-2">
          <Clock className="w-10 h-10 text-zinc-400 mx-auto" />
          <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
            {searchQuery || statusFilter !== 'all'
              ? 'Không tìm thấy run nào khớp với bộ lọc'
              : 'Chưa có kế hoạch hoặc lượt chạy nào trong repository này'}
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Hãy chuyển sang mục &quot;Chat lập kế hoạch&quot; để tạo và chạy kế hoạch điều phối mới.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRuns.map((run) => {
            const shortId = run.id.slice(0, 8);
            const dateStr = new Date(run.createdAt).toLocaleString([], {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const taskCount = run.plan?.tasks?.length || 0;

            return (
              <div
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                className="p-5 rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 hover:border-indigo-400/50 hover:shadow-lg hover:shadow-indigo-500/5 transition-all cursor-pointer backdrop-blur-xl group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-200">
                      #{shortId}
                    </span>
                    {getStatusBadge(run.status)}
                    <span className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{dateStr}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {taskCount > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.05] border border-black/10 dark:border-white/10 text-xs font-mono text-zinc-700 dark:text-zinc-300">
                        {taskCount} tasks
                      </span>
                    )}
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Xem Bảng Kanban</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>

                <div className="pt-3">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-relaxed">
                    {run.goal || 'Không có mô tả mục tiêu'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
