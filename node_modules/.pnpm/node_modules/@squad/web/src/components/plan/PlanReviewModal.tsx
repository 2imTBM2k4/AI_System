import React, { useState } from 'react';
import { Play, AlertTriangle, X, GitBranch, Terminal, Layers } from 'lucide-react';
import type { PlanResponse } from '@squad/shared-types';
import { startRun } from '../../api/client';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Run #{runId.slice(0, 8)}
              </span>
              <span className="text-xs text-zinc-400">Xem trước Kế hoạch Thực thi</span>
            </div>
            <h3 className="text-lg font-bold text-zinc-100">&ldquo;{plan.goal}&rdquo;</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Conflict Warnings */}
          {warnings && warnings.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
              <div className="flex items-center gap-2 font-semibold text-xs mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Cảnh báo Xung đột File giữa các Task song song ({warnings.length})
              </div>
              <ul className="text-xs space-y-1 list-disc list-inside text-amber-200/90 font-mono">
                {warnings.map((w, i) => (
                  <li key={i}>
                    Task <span className="font-bold">{w.taskA}</span> và{' '}
                    <span className="font-bold">{w.taskB}</span> cùng sửa:{' '}
                    <span className="text-amber-100">{w.files.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Task List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> Danh sách Task được đề xuất ({plan.tasks.length})
            </h4>

            {plan.tasks.map((task, idx) => (
              <div
                key={task.id}
                className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 hover:border-zinc-700/80 transition-all space-y-2.5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-zinc-800 text-zinc-300 text-xs font-mono flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-sm text-zinc-200">
                      {task.title}
                    </span>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wide">
                    {task.role}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-zinc-500">Branch:</span>
                    <span className="text-zinc-300">{task.branch}</span>
                  </div>
                  {task.verify && (
                    <div className="flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-zinc-500">Verify:</span>
                      <span className="text-emerald-400">{task.verify}</span>
                    </div>
                  )}
                </div>

                {task.files.length > 0 && (
                  <div className="text-xs text-zinc-400">
                    <span className="text-zinc-500">Files: </span>
                    {task.files.map((f, fi) => (
                      <span
                        key={fi}
                        className="inline-block bg-zinc-900 px-1.5 py-0.5 rounded text-zinc-300 font-mono mr-1 text-[11px] border border-zinc-800"
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
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-950/40 flex items-center justify-end gap-3 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={isStarting}
            className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleStartRun}
            disabled={isStarting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs tracking-wide uppercase transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{isStarting ? 'Đang kích hoạt...' : 'Bắt đầu Run (Khởi chạy Agents)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
