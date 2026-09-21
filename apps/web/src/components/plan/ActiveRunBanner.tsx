import React from 'react';
import { AlertTriangle, ArrowRight, Play, Clock, ShieldCheck } from 'lucide-react';
import type { RunRecordDto } from '@squad/shared-types';
import { GlassBadge } from '../glass/GlassBadge';

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
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-r from-amber-50/80 via-white/80 to-white/90 dark:from-amber-950/30 dark:via-zinc-900/60 dark:to-zinc-950/70 backdrop-blur-2xl p-6 shadow-[0_8px_30px_rgba(245,158,11,0.08)] dark:shadow-[0_8px_32px_rgba(245,158,11,0.12)]">
      {/* Specular highlight border */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent pointer-events-none"
      />

      {/* Decorative ambient liquid light */}
      <div className="absolute -top-16 -right-16 w-56 h-56 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/35 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/10">
            {isRunning ? (
              <Play className="w-5 h-5 fill-amber-500 dark:fill-amber-400 animate-pulse" />
            ) : (
              <Clock className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                Repository đang có Run #{shortId} đang hoạt động
              </span>
              <GlassBadge variant={isRunning ? 'amber' : 'cyan'} dot pulse={isRunning}>
                <span className="uppercase tracking-wider font-bold text-[10px]">
                  {activeRun.status}
                </span>
              </GlassBadge>
            </div>

            <p className="text-sm text-zinc-700 dark:text-zinc-200 font-medium line-clamp-2 max-w-2xl leading-relaxed">
              &ldquo;{activeRun.goal}&rdquo;
            </p>

            <div className="flex items-center gap-2 pt-1 text-xs text-zinc-500 dark:text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
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
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-zinc-950 font-bold text-xs tracking-wide uppercase transition-all shadow-lg shadow-amber-500/25 hover:scale-[1.02] active:scale-[0.98] cursor-pointer border border-amber-300/40 relative overflow-hidden"
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-white/40 pointer-events-none"
            />
            <span>Xem tiến độ Run #{shortId}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
