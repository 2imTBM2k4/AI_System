import React, { useState } from 'react';
import {
  GitMerge,
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
} from 'lucide-react';
import type {
  RunRecordDto,
  TaskRecordDto,
  MergeReportDto,
} from '@squad/shared-types';
import { TaskCard } from './TaskCard';
import { MergeModal } from './MergeModal';
import { LogDrawer } from '../terminal/LogDrawer';
import { mergeRun } from '../../api/client';

interface KanbanBoardProps {
  run: RunRecordDto;
  tasks: Record<string, TaskRecordDto>;
  taskLogs: Record<string, string[]>;
  onTaskCancelled?: (taskId: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  run,
  tasks,
  taskLogs,
  onTaskCancelled,
}) => {
  const [activeLogTaskId, setActiveLogTaskId] = useState<string | null>(null);
  const [mergeReport, setMergeReport] = useState<MergeReportDto | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const taskList = Object.values(tasks);

  // Phân chia 4 làn Kanban
  const pendingTasks = taskList.filter((t) => t.status === 'pending');
  const runningTasks = taskList.filter((t) => t.status === 'running');
  const passedTasks = taskList.filter((t) => t.status === 'passed');
  const failedTasks = taskList.filter((t) =>
    [
      'verify_failed',
      'agent_failed',
      'bootstrap_failed',
      'cancelled',
      'skipped',
      'interrupted',
      'error',
    ].includes(t.status)
  );

  const isAllTasksDone =
    taskList.length > 0 &&
    taskList.every((t) =>
      ['passed', 'verify_failed', 'agent_failed', 'bootstrap_failed', 'cancelled', 'skipped', 'interrupted', 'error'].includes(
        t.status
      )
    );

  const handleMerge = async () => {
    try {
      setIsMerging(true);
      setMergeError(null);
      const res = await mergeRun(run.id);
      setMergeReport(res.report);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Lỗi khi merge run');
    } finally {
      setIsMerging(false);
    }
  };

  const selectedLogTask = activeLogTaskId ? tasks[activeLogTaskId] || null : null;
  const currentLogs = activeLogTaskId ? taskLogs[activeLogTaskId] || [] : [];

  return (
    <div className="space-y-6">
      {/* Board Header */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-indigo-400">
              Run #{run.id.slice(0, 8)}
            </span>
            <span
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                run.status === 'running'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : run.status === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}
            >
              {run.status}
            </span>
            <div className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date(run.createdAt).toLocaleString()}</span>
            </div>
          </div>
          <h2 className="text-base font-semibold text-zinc-200">
            &ldquo;{run.goal}&rdquo;
          </h2>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-3">
          {mergeError && (
            <span className="text-xs text-rose-400 max-w-xs truncate">{mergeError}</span>
          )}

          <button
            type="button"
            onClick={handleMerge}
            disabled={isMerging || runningTasks.length > 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs tracking-wide uppercase transition-all shadow-lg ${
              isAllTasksDone
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60'
            } disabled:opacity-40 cursor-pointer`}
            title={
              runningTasks.length > 0
                ? 'Vẫn còn task đang chạy, chưa thể merge'
                : 'Merge các task đã passed vào integration branch'
            }
          >
            {isMerging ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang merge...</span>
              </>
            ) : (
              <>
                <GitMerge className="w-4 h-4" />
                <span>Approve & Merge ({passedTasks.length} passed)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4-Lane Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Lane 1: Pending */}
        <div className="flex flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-4 min-h-[500px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Pending
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
              {pendingTasks.length}
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {pendingTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onOpenLog={setActiveLogTaskId}
                onCancelled={onTaskCancelled}
              />
            ))}
          </div>
        </div>

        {/* Lane 2: Running */}
        <div className="flex flex-col rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 min-h-[500px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-amber-500/20">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 fill-amber-400 text-amber-400 animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Running
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
              {runningTasks.length}
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {runningTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onOpenLog={setActiveLogTaskId}
                onCancelled={onTaskCancelled}
              />
            ))}
          </div>
        </div>

        {/* Lane 3: Passed */}
        <div className="flex flex-col rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 min-h-[500px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-emerald-500/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Passed
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
              {passedTasks.length}
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {passedTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onOpenLog={setActiveLogTaskId}
                onCancelled={onTaskCancelled}
              />
            ))}
          </div>
        </div>

        {/* Lane 4: Failed / Cancelled */}
        <div className="flex flex-col rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 min-h-[500px]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-rose-500/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                Failed / Cancelled
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
              {failedTasks.length}
            </span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto">
            {failedTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onOpenLog={setActiveLogTaskId}
                onCancelled={onTaskCancelled}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Log Drawer */}
      {selectedLogTask && (
        <LogDrawer
          task={selectedLogTask}
          logs={currentLogs}
          onClose={() => setActiveLogTaskId(null)}
        />
      )}

      {/* Merge Modal */}
      {mergeReport && (
        <MergeModal
          report={mergeReport}
          onClose={() => setMergeReport(null)}
        />
      )}
    </div>
  );
};
