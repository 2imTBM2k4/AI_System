import React, { useState } from 'react';
import { Sparkles, ArrowRight, Loader2, Compass } from 'lucide-react';
import type { PlanResponse } from '@squad/shared-types';
import { createPlan } from '../../api/client';

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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl relative overflow-hidden">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-zinc-100 tracking-tight">
            Lập kế hoạch thực thi mới (Planner Agent)
          </h2>
          <p className="text-xs text-zinc-400">
            Mô tả mục tiêu của bạn. Agent Planner sẽ tự động phân rã thành các task song song độc lập.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <textarea
            aria-label="Mô tả mục tiêu triển khai"
            rows={3}
            placeholder="Ví dụ: Thêm middleware xác thực token JWT, viết unit tests và cập nhật documentation..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {/* Quick prompt suggestions */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-400">
          <span className="flex items-center gap-1 text-zinc-500">
            <Compass className="w-3.5 h-3.5" /> Gợi ý:
          </span>
          <button
            type="button"
            onClick={() =>
              handleExampleClick(
                'Tối ưu hóa performance database query và thêm index'
              )
            }
            className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 transition-colors border border-zinc-700/50"
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
            className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 transition-colors border border-zinc-700/50"
          >
            Viết unit tests
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isLoading || !goal.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs tracking-wide uppercase transition-all shadow-lg shadow-indigo-600/25 cursor-pointer"
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
          </button>
        </div>
      </form>
    </div>
  );
};
