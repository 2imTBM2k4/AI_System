import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, GitMerge, X } from 'lucide-react';
import type { MergeReportDto } from '@squad/shared-types';

interface MergeModalProps {
  report: MergeReportDto;
  onClose: () => void;
}

export const MergeModal: React.FC<MergeModalProps> = ({ report, onClose }) => {
  const hasConflicts = report.conflicts.length > 0;
  const hasVerifyFailed = report.verifyFailed.length > 0;
  const isSuccess = !hasConflicts && !hasVerifyFailed && report.merged.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6 border-b border-zinc-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isSuccess
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-amber-500/10 text-amber-400'
              }`}
            >
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                Báo cáo Merge vào Nhánh Tích hợp
              </h3>
              <p className="text-xs text-zinc-400 font-mono">
                Nhánh đích: <span className="text-indigo-400">{report.integrationBranch}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Merged successfully */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã merge thành công ({report.merged.length})</span>
            </div>
            {report.merged.length === 0 ? (
              <p className="text-xs text-zinc-500 italic pl-6">Không có branch nào được merge</p>
            ) : (
              <div className="space-y-1 pl-6">
                {report.merged.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-zinc-950 border border-zinc-800/80"
                  >
                    <span className="text-zinc-300">Task #{m.id}</span>
                    <span className="text-emerald-400">{m.branch}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Conflicts */}
          {hasConflicts && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Xung đột Git Merge ({report.conflicts.length})</span>
              </div>
              <div className="space-y-1.5 pl-6">
                {report.conflicts.map((c) => (
                  <div
                    key={c.id}
                    className="text-xs font-mono p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300"
                  >
                    <div className="font-semibold mb-1">
                      Task #{c.id} ({c.branch})
                    </div>
                    <div className="text-[11px] text-rose-200">
                      Files xung đột: {c.files.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verify failed */}
          {hasVerifyFailed && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                <XCircle className="w-4 h-4" />
                <span>Verify thất bại sau khi merge ({report.verifyFailed.length})</span>
              </div>
              <div className="space-y-1 pl-6">
                {report.verifyFailed.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300"
                  >
                    <span>Task #{v.id} ({v.branch})</span>
                    <span>Exit code: {v.exitCode}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Not merged */}
          {report.notMerged.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Chưa đủ điều kiện merge ({report.notMerged.length})
              </div>
              <div className="space-y-1 pl-6">
                {report.notMerged.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400"
                  >
                    <span>Task #{n.id} ({n.branch})</span>
                    <span className="text-zinc-500 font-semibold">{n.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 bg-zinc-950/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
