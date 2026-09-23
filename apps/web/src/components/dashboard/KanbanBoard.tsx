import React, { useState } from 'react';
import {
  GitMerge,
  Clock,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  Rows3,
  Columns3,
} from 'lucide-react';
import type {
  RunRecordDto,
  TaskRecordDto,
  MergeReportDto,
} from '@squad/shared-types';
import { TaskCard } from './TaskCard';
import { MergeModal } from './MergeModal';
import { LogDrawer } from '../terminal/LogDrawer';
import { mergeRun, startRun } from '../../api/client';
import { GlassCard } from '../glass/GlassCard';
import { GlassBadge } from '../glass/GlassBadge';
import { GlassButton } from '../glass/GlassButton';

interface KanbanBoardProps {
  run: RunRecordDto;
  tasks: Record<string, TaskRecordDto>;
  taskLogs: Record<string, string[]>;
  repoId?: string;
  onTaskCancelled?: (taskId: string) => void;
  onRunStarted?: (runId: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  run,
  tasks,
  taskLogs,
  repoId,
  onTaskCancelled,
  onRunStarted,
}) => {
  const [activeLogTaskId, setActiveLogTaskId] = useState<string | null>(null);
  const [mergeReport, setMergeReport] = useState<MergeReportDto | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'grid'>(() => {
    return (localStorage.getItem('squad_kanban_layout') as 'horizontal' | 'grid') || 'horizontal';
  });

  const handleToggleLayout = (mode: 'horizontal' | 'grid') => {
    setLayoutMode(mode);
    localStorage.setItem('squad_kanban_layout', mode);
  };

  const handleStartRun = async () => {
    if (!repoId) return;
    try {
      setIsStartingRun(true);
      setActionError(null);
      await startRun(repoId, { runId: run.id });
      onRunStarted?.(run.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Không thể khởi chạy Run');
    } finally {
      setIsStartingRun(false);
    }
  };

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
      {/* Board Header Glass Hero */}
      <GlassCard variant="default" className="p-6 md:p-7 relative overflow-hidden">
        {/* Specular edge top */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent pointer-events-none"
        />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-500/20">
                Run #{run.id.slice(0, 8)}
              </span>
              <GlassBadge
                variant={
                  run.status === 'running'
                    ? 'amber'
                    : run.status === 'completed'
                    ? 'emerald'
                    : 'neutral'
                }
                dot
                pulse={run.status === 'running'}
              >
                <span className="uppercase tracking-wider font-bold text-[10px]">
                  {run.status}
                </span>
              </GlassBadge>
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                <span>{new Date(run.createdAt).toLocaleString()}</span>
              </div>
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              &ldquo;{run.goal}&rdquo;
            </h2>
          </div>

          {/* Action button & View Switcher */}
          <div className="flex items-center gap-3 flex-wrap">
            {(mergeError || actionError) && (
              <span className="text-xs text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 px-3 py-1.5 rounded-lg max-w-xs truncate">
                {mergeError || actionError}
              </span>
            )}

            {/* Layout View Toggle */}
            <div className="flex items-center rounded-xl p-1 bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] backdrop-blur-md">
              <button
                type="button"
                onClick={() => handleToggleLayout('horizontal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  layoutMode === 'horizontal'
                    ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-black/5 dark:border-white/10'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
                title="Hiển thị theo Làn Ngang (Horizontal Lanes)"
              >
                <Rows3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Làn Ngang</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleLayout('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  layoutMode === 'grid'
                    ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-black/5 dark:border-white/10'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
                title="Hiển thị theo Cột Dọc (4-Column Grid)"
              >
                <Columns3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cột Dọc</span>
              </button>
            </div>

            {run.status === 'planned' && repoId ? (
              <GlassButton
                type="button"
                variant="success"
                size="lg"
                glow
                onClick={handleStartRun}
                disabled={isStartingRun}
                title="Bắt đầu khởi chạy các coding agents cho Plan này"
              >
                {isStartingRun ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang khởi chạy agents...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Bắt đầu Run (Khởi chạy Agents)</span>
                  </>
                )}
              </GlassButton>
            ) : (
              <GlassButton
                type="button"
                variant={isAllTasksDone ? 'success' : 'secondary'}
                size="lg"
                glow={isAllTasksDone}
                onClick={handleMerge}
                disabled={isMerging || runningTasks.length > 0}
                className={isAllTasksDone ? 'animate-pulse' : ''}
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
              </GlassButton>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Kanban Board: Horizontal Lanes OR 4-Column Grid */}
      {layoutMode === 'horizontal' ? (
        <div className="space-y-4">
          {/* Lane 1: Pending */}
          <div className="flex flex-col lg:flex-row items-stretch rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/65 dark:bg-zinc-950/35 backdrop-blur-xl p-4 gap-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] relative overflow-hidden transition-colors duration-200">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-black/10 dark:via-white/15 to-transparent pointer-events-none"
            />
            {/* Left Lane Header */}
            <div className="w-full lg:w-48 shrink-0 flex lg:flex-col justify-between items-start p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.04] dark:border-white/[0.05]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Pending
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 hidden lg:block">Chờ worker nhận việc</p>
              </div>
              <GlassBadge variant="neutral">
                <span className="font-mono text-xs font-bold">{pendingTasks.length} task(s)</span>
              </GlassBadge>
            </div>

            {/* Right Horizontal Cards Row */}
            <div className="flex-1 flex items-stretch gap-3 overflow-x-auto pb-1 scrollbar-thin">
              {pendingTasks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6 border border-dashed border-black/10 dark:border-white/10 rounded-xl text-xs text-zinc-400 font-mono">
                  Chưa có task nào đang chờ
                </div>
              ) : (
                pendingTasks.map((t) => (
                  <div key={t.id} className="min-w-[280px] w-72 md:w-80 shrink-0">
                    <TaskCard
                      task={t}
                      onOpenLog={setActiveLogTaskId}
                      onCancelled={onTaskCancelled}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Lane 2: Running */}
          <div className="flex flex-col lg:flex-row items-stretch rounded-2xl border border-amber-500/25 bg-amber-50/50 dark:bg-amber-950/15 backdrop-blur-xl p-4 gap-4 shadow-[0_0_25px_rgba(245,158,11,0.04)] dark:shadow-[0_0_30px_rgba(245,158,11,0.06)] relative overflow-hidden transition-colors duration-200">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 dark:via-amber-400/30 to-transparent pointer-events-none"
            />
            {/* Left Lane Header */}
            <div className="w-full lg:w-48 shrink-0 flex lg:flex-col justify-between items-start p-3.5 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 fill-amber-500 text-amber-500 animate-pulse" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    Running
                  </h3>
                </div>
                <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 hidden lg:block">Agent đang thực thi</p>
              </div>
              <GlassBadge variant="amber" dot pulse>
                <span className="font-mono text-xs font-bold">{runningTasks.length} task(s)</span>
              </GlassBadge>
            </div>

            {/* Right Horizontal Cards Row */}
            <div className="flex-1 flex items-stretch gap-3 overflow-x-auto pb-1 scrollbar-thin">
              {runningTasks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6 border border-dashed border-amber-500/20 rounded-xl text-xs text-amber-500/70 font-mono">
                  Không có agent nào đang chạy
                </div>
              ) : (
                runningTasks.map((t) => (
                  <div key={t.id} className="min-w-[280px] w-72 md:w-80 shrink-0">
                    <TaskCard
                      task={t}
                      onOpenLog={setActiveLogTaskId}
                      onCancelled={onTaskCancelled}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Lane 3: Passed */}
          <div className="flex flex-col lg:flex-row items-stretch rounded-2xl border border-emerald-500/25 bg-emerald-50/50 dark:bg-emerald-950/15 backdrop-blur-xl p-4 gap-4 shadow-[0_0_25px_rgba(16,185,129,0.04)] dark:shadow-[0_0_30px_rgba(16,185,129,0.06)] relative overflow-hidden transition-colors duration-200">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 dark:via-emerald-400/30 to-transparent pointer-events-none"
            />
            {/* Left Lane Header */}
            <div className="w-full lg:w-48 shrink-0 flex lg:flex-col justify-between items-start p-3.5 rounded-xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Passed
                  </h3>
                </div>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 hidden lg:block">Đã kiểm thử thành công</p>
              </div>
              <GlassBadge variant="emerald" dot>
                <span className="font-mono text-xs font-bold">{passedTasks.length} task(s)</span>
              </GlassBadge>
            </div>

            {/* Right Horizontal Cards Row */}
            <div className="flex-1 flex items-stretch gap-3 overflow-x-auto pb-1 scrollbar-thin">
              {passedTasks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6 border border-dashed border-emerald-500/20 rounded-xl text-xs text-emerald-500/70 font-mono">
                  Chưa có task nào passed
                </div>
              ) : (
                passedTasks.map((t) => (
                  <div key={t.id} className="min-w-[280px] w-72 md:w-80 shrink-0">
                    <TaskCard
                      task={t}
                      onOpenLog={setActiveLogTaskId}
                      onCancelled={onTaskCancelled}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Lane 4: Failed / Cancelled */}
          <div className="flex flex-col lg:flex-row items-stretch rounded-2xl border border-rose-500/25 bg-rose-50/50 dark:bg-rose-950/15 backdrop-blur-xl p-4 gap-4 shadow-[0_0_25px_rgba(244,63,94,0.04)] dark:shadow-[0_0_30px_rgba(244,63,94,0.06)] relative overflow-hidden transition-colors duration-200">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-400/40 dark:via-rose-400/30 to-transparent pointer-events-none"
            />
            {/* Left Lane Header */}
            <div className="w-full lg:w-48 shrink-0 flex lg:flex-col justify-between items-start p-3.5 rounded-xl bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                    Failed / Cancelled
                  </h3>
                </div>
                <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 hidden lg:block">Gặp lỗi hoặc đã hủy</p>
              </div>
              <GlassBadge variant="rose" dot>
                <span className="font-mono text-xs font-bold">{failedTasks.length} task(s)</span>
              </GlassBadge>
            </div>

            {/* Right Horizontal Cards Row */}
            <div className="flex-1 flex items-stretch gap-3 overflow-x-auto pb-1 scrollbar-thin">
              {failedTasks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6 border border-dashed border-rose-500/20 rounded-xl text-xs text-rose-500/70 font-mono">
                  Không có task nào lỗi/hủy
                </div>
              ) : (
                failedTasks.map((t) => (
                  <div key={t.id} className="min-w-[280px] w-72 md:w-80 shrink-0">
                    <TaskCard
                      task={t}
                      onOpenLog={setActiveLogTaskId}
                      onCancelled={onTaskCancelled}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* 4-Lane Column Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Lane 1: Pending */}
          <div className="flex flex-col rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/65 dark:bg-zinc-950/35 backdrop-blur-xl p-4 min-h-[520px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] relative overflow-hidden transition-colors duration-200">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-black/10 dark:via-white/15 to-transparent pointer-events-none"
            />

            <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Pending
                </h3>
              </div>
              <GlassBadge variant="neutral">
                <span className="font-mono text-xs font-bold">{pendingTasks.length}</span>
              </GlassBadge>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
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
          <div className="flex flex-col rounded-2xl border border-amber-500/25 bg-amber-50/50 dark:bg-amber-950/15 backdrop-blur-xl p-4 min-h-[520px] shadow-[0_0_25px_rgba(245,158,11,0.04)] dark:shadow-[0_0_30px_rgba(245,158,11,0.06)] relative overflow-hidden transition-colors duration-200">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 dark:via-amber-400/30 to-transparent pointer-events-none"
            />

            <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-amber-500/20">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 fill-amber-500 dark:fill-amber-400 text-amber-500 dark:text-amber-400 animate-pulse" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Running
                </h3>
              </div>
              <GlassBadge variant="amber" dot pulse>
                <span className="font-mono text-xs font-bold">{runningTasks.length}</span>
              </GlassBadge>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
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
          <div className="flex flex-col rounded-2xl border border-emerald-500/25 bg-emerald-50/50 dark:bg-emerald-950/15 backdrop-blur-xl p-4 min-h-[520px] shadow-[0_0_25px_rgba(16,185,129,0.04)] dark:shadow-[0_0_30px_rgba(16,185,129,0.06)] relative overflow-hidden transition-colors duration-200">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 dark:via-emerald-400/30 to-transparent pointer-events-none"
            />

            <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-emerald-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Passed
                </h3>
              </div>
              <GlassBadge variant="emerald" dot>
                <span className="font-mono text-xs font-bold">{passedTasks.length}</span>
              </GlassBadge>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
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
          <div className="flex flex-col rounded-2xl border border-rose-500/25 bg-rose-50/50 dark:bg-rose-950/15 backdrop-blur-xl p-4 min-h-[520px] shadow-[0_0_25px_rgba(244,63,94,0.04)] dark:shadow-[0_0_30px_rgba(244,63,94,0.06)] relative overflow-hidden transition-colors duration-200">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-400/40 dark:via-rose-400/30 to-transparent pointer-events-none"
            />

            <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-rose-500/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                  Failed / Cancelled
                </h3>
              </div>
              <GlassBadge variant="rose" dot>
                <span className="font-mono text-xs font-bold">{failedTasks.length}</span>
              </GlassBadge>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
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
      )}

      {/* Terminal Log Drawer */}
      {selectedLogTask && (
        <LogDrawer
          task={selectedLogTask}
          logs={currentLogs}
          runningTasks={runningTasks}
          onSelectTask={(id) => setActiveLogTaskId(id)}
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
