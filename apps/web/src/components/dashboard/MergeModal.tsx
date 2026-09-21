import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, GitMerge, X } from 'lucide-react';
import type { MergeReportDto } from '@squad/shared-types';
import { GlassButton } from '../glass/GlassButton';

interface MergeModalProps {
  report: MergeReportDto;
  onClose: () => void;
}

export const MergeModal: React.FC<MergeModalProps> = ({ report, onClose }) => {
  const hasConflicts = report.conflicts.length > 0;
  const hasVerifyFailed = report.verifyFailed.length > 0;
  const isSuccess = !hasConflicts && !hasVerifyFailed && report.merged.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative bg-white/95 dark:bg-zinc-950/85 backdrop-blur-2xl border border-black/10 dark:border-white/[0.12] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.85)] animate-in zoom-in-95 duration-200 overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Specular edge highlight */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 dark:via-white/30 to-transparent pointer-events-none"
        />

        {/* Modal Header */}
        <div className="p-6 border-b border-black/[0.06] dark:border-white/[0.08] flex items-start justify-between bg-black/[0.01] dark:bg-white/[0.02]">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-lg ${
                isSuccess
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-emerald-500/10'
                  : 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-amber-500/10'
              }`}
            >
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Báo cáo Merge vào Nhánh Tích hợp
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                Nhánh đích: <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{report.integrationBranch}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Merged successfully */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã merge thành công ({report.merged.length})</span>
            </div>
            {report.merged.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 italic pl-6">Không có branch nào được merge</p>
            ) : (
              <div className="space-y-1.5 pl-6">
                {report.merged.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-xs font-mono p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] backdrop-blur-md"
                  >
                    <span className="text-zinc-800 dark:text-zinc-300 font-semibold">Task #{m.id}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">{m.branch}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Conflicts */}
          {hasConflicts && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Xung đột Git Merge ({report.conflicts.length})</span>
              </div>
              <div className="space-y-2 pl-6">
                {report.conflicts.map((c) => (
                  <div
                    key={c.id}
                    className="text-xs font-mono p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-rose-800 dark:text-rose-300 backdrop-blur-md"
                  >
                    <div className="font-bold mb-1 text-rose-900 dark:text-rose-200">
                      Task #{c.id} ({c.branch})
                    </div>
                    <div className="text-[11px] text-rose-700 dark:text-rose-300/90">
                      Files xung đột: {c.files.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verify failed */}
          {hasVerifyFailed && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <XCircle className="w-4 h-4" />
                <span>Verify thất bại sau khi merge ({report.verifyFailed.length})</span>
              </div>
              <div className="space-y-1.5 pl-6">
                {report.verifyFailed.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-xs font-mono p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-amber-800 dark:text-amber-300 backdrop-blur-md"
                  >
                    <span className="font-semibold">Task #{v.id} ({v.branch})</span>
                    <span className="bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 rounded text-[11px]">Exit code: {v.exitCode}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Not merged */}
          {report.notMerged.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Chưa đủ điều kiện merge ({report.notMerged.length})
              </div>
              <div className="space-y-1.5 pl-6">
                {report.notMerged.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between text-xs font-mono p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.05] dark:border-white/[0.05] text-zinc-600 dark:text-zinc-400"
                  >
                    <span>Task #{n.id} ({n.branch})</span>
                    <span className="text-zinc-400 dark:text-zinc-500 font-semibold">{n.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] flex justify-end">
          <GlassButton
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
          >
            Đóng
          </GlassButton>
        </div>
      </div>
    </div>
  );
};
