import React from 'react';
import { AlertTriangle, ArrowRight, Play, Clock, ShieldCheck } from 'lucide-react';
import type { RunRecordDto } from '@squad/shared-types';

interface ActiveRunBannerProps {
  activeRun: RunRecordDto;
  onViewRun: (runId: string) => void;
}

export const ActiveRunBanner: React.FC<ActiveRunBannerProps> = ({
  activeRun,
  onViewRun,
}) => {
  const shortId = activeRun.id.slice(0, 8);
  const isRunning = activeRun.status === 'running';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-zinc-900 to-zinc-950 p-6 shadow-xl shadow-amber-500/5">
      {/* Background ambient decorative glow */}
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            {isRunning ? (
              <Play className="w-6 h-6 fill-amber-400 animate-pulse" />
            ) : (
              <Clock className="w-6 h-6 text-amber-400" />
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Repository đang có Run #{shortId} đang hoạt động
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  isRunning
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                }`}
              >
                {activeRun.status}
              </span>
            </div>

            <p className="text-sm text-zinc-300 font-medium line-clamp-2 max-w-2xl">
              &ldquo;{activeRun.goal}&rdquo;
            </p>

            <div className="flex items-center gap-2 pt-1 text-xs text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Ràng buộc kiến trúc (Phụ lục E): Mỗi repo chỉ có tối đa 1 run active để cô lập an toàn Git worktrees.
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onViewRun(activeRun.id)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-xs tracking-wide uppercase transition-all shadow-lg shadow-amber-500/25 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Xem tiến độ Run #{shortId}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
