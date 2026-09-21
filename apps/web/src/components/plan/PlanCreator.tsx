import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2, Compass } from 'lucide-react';
import type { PlanResponse } from '@squad/shared-types';
import { createPlan } from '../../api/client';
import { GlassCard } from '../glass/GlassCard';
import { GlassButton } from '../glass/GlassButton';

interface PlanCreatorProps {
  repoId: string;
  onPlanCreated: (planData: PlanResponse) => void;
}

export const PlanCreator: React.FC<PlanCreatorProps> = ({
  repoId,
  onPlanCreated,
}) => {
  const [goal, setGoal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || isLoading) return;

    try {
      setIsLoading(true);
      setError(null);
      const data = await createPlan(repoId, goal.trim());
      onPlanCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lập kế hoạch');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setGoal(example);
  };

  return (
    <GlassCard variant="default" className="p-6 md:p-7 relative overflow-hidden">
      {/* Ambient background light */}
      <div className="absolute -top-20 -left-20 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center gap-3.5 mb-5 relative z-10">
        <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-gradient-to-br dark:from-indigo-500/20 dark:to-purple-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shadow-md shadow-indigo-500/10">
          <Sparkles className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Lập kế hoạch thực thi mới (Planner Agent)
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Mô tả mục tiêu của bạn. Agent Planner sẽ tự động phân rã thành các task song song độc lập.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
        <div>
          <textarea
            aria-label="Mô tả mục tiêu triển khai"
            rows={3}
            placeholder="Ví dụ: Thêm middleware xác thực token JWT, viết unit tests và cập nhật documentation..."
            className="liquid-glass-input w-full rounded-2xl p-4 text-sm placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none transition-all resize-none leading-relaxed"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {/* Quick prompt suggestions */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-600 dark:text-zinc-400">
          <span className="flex items-center gap-1 font-medium text-zinc-500 dark:text-zinc-400">
            <Compass className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" /> Gợi ý:
          </span>
          <button
            type="button"
            onClick={() =>
              handleExampleClick(
                'Tối ưu hóa performance database query và thêm index'
              )
            }
            className="px-3 py-1 rounded-xl bg-black/[0.03] hover:bg-black/[0.06] text-zinc-700 hover:text-zinc-900 dark:bg-white/[0.03] dark:hover:bg-white/[0.08] dark:text-zinc-300 dark:hover:text-white transition-all border border-black/10 dark:border-white/[0.08] backdrop-blur-md cursor-pointer text-xs"
          >
            Tối ưu DB queries
          </button>
          <button
            type="button"
            onClick={() =>
              handleExampleClick(
                'Viết bộ kiểm thử unit tests cho core runner'
              )
            }
            className="px-3 py-1 rounded-xl bg-black/[0.03] hover:bg-black/[0.06] text-zinc-700 hover:text-zinc-900 dark:bg-white/[0.03] dark:hover:bg-white/[0.08] dark:text-zinc-300 dark:hover:text-white transition-all border border-black/10 dark:border-white/[0.08] backdrop-blur-md cursor-pointer text-xs"
          >
            Viết unit tests
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <GlassButton
            type="submit"
            variant="primary"
            size="lg"
            glow
            disabled={isLoading || !goal.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Planner đang phân rã task...</span>
              </>
            ) : (
              <>
                <span>Lập kế hoạch (Generate Plan)</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </GlassButton>
        </div>
      </form>
    </GlassCard>
  );
};
