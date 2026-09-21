import React, { useState } from 'react';
import { Play, AlertTriangle, X, GitBranch, Terminal, Layers } from 'lucide-react';
import type { PlanResponse } from '@squad/shared-types';
import { startRun } from '../../api/client';
import { GlassButton } from '../glass/GlassButton';
import { GlassBadge } from '../glass/GlassBadge';

interface PlanReviewModalProps {
  repoId: string;
  planData: PlanResponse;
  onClose: () => void;
  onRunStarted: (runId: string) => void;
}

export const PlanReviewModal: React.FC<PlanReviewModalProps> = ({
  repoId,
  planData,
  onClose,
  onRunStarted,
}) => {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { runId, plan, warnings } = planData;

  const handleStartRun = async () => {
    try {
      setIsStarting(true);
      setError(null);
      const res = await startRun(repoId, { runId });
      onRunStarted(res.run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể khởi động Run');
      setIsStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative bg-white/95 dark:bg-zinc-950/85 backdrop-blur-2xl border border-black/10 dark:border-white/[0.12] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.85)] animate-in zoom-in-95 duration-200 overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Specular highlight border */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent pointer-events-none"
        />

        {/* Header */}
        <div className="p-6 border-b border-black/[0.06] dark:border-white/[0.08] flex items-start justify-between bg-black/[0.01] dark:bg-white/[0.02]">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                Run #{runId.slice(0, 8)}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Xem trước Kế hoạch Thực thi</span>
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">&ldquo;{plan.goal}&rdquo;</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Conflict Warnings */}
          {warnings && warnings.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 backdrop-blur-md">
              <div className="flex items-center gap-2 font-semibold text-xs mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                Cảnh báo Xung đột File giữa các Task song song ({warnings.length})
              </div>
              <ul className="text-xs space-y-1 list-disc list-inside text-amber-800/90 dark:text-amber-200/90 font-mono">
                {warnings.map((w, i) => (
                  <li key={i}>
                    Task <span className="font-bold">{w.taskA}</span> và{' '}
                    <span className="font-bold">{w.taskB}</span> cùng sửa:{' '}
                    <span className="text-amber-900 dark:text-amber-100 font-semibold">{w.files.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Task List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> Danh sách Task được đề xuất ({plan.tasks.length})
            </h4>

            {plan.tasks.map((task, idx) => (
              <div
                key={task.id}
                className="p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.07] bg-black/[0.02] dark:bg-white/[0.025] hover:bg-black/[0.04] dark:hover:bg-white/[0.05] hover:border-black/15 dark:hover:border-white/[0.14] transition-all space-y-2.5 backdrop-blur-md relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10 text-zinc-700 dark:text-zinc-300 text-xs font-mono flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      {task.title}
                    </span>
                  </div>
                  <GlassBadge variant="indigo">
                    <span className="uppercase tracking-wider text-[10px] font-bold">
                      {task.role}
                    </span>
                  </GlassBadge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                    <span>Branch:</span>
                    <span className="text-zinc-800 dark:text-zinc-200">{task.branch}</span>
                  </div>
                  {task.verify && (
                    <div className="flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Verify:</span>
                      <span className="text-emerald-700 dark:text-emerald-300">{task.verify}</span>
                    </div>
                  )}
                </div>

                {task.files.length > 0 && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    <span>Files: </span>
                    {task.files.map((f, fi) => (
                      <span
                        key={fi}
                        className="inline-block bg-black/[0.03] dark:bg-white/[0.04] px-2 py-0.5 rounded text-zinc-700 dark:text-zinc-300 font-mono mr-1 text-[11px] border border-black/10 dark:border-white/[0.06]"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] flex items-center justify-end gap-3 rounded-b-2xl">
          <GlassButton
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={isStarting}
          >
            Đóng
          </GlassButton>
          <GlassButton
            type="button"
            variant="success"
            size="lg"
            glow
            onClick={handleStartRun}
            disabled={isStarting}
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{isStarting ? 'Đang kích hoạt...' : 'Bắt đầu Run (Khởi chạy Agents)'}</span>
          </GlassButton>
        </div>
      </div>
    </div>
  );
};
