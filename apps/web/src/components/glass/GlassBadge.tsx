import React from 'react';
import { cn } from '../../lib/utils';

export interface GlassBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'purple';
  dot?: boolean;
  pulse?: boolean;
}

export const GlassBadge: React.FC<GlassBadgeProps> = ({
  children,
  className,
  variant = 'neutral',
  dot = false,
  pulse = false,
  ...props
}) => {
  const styles = {
    neutral:
      'bg-black/[0.04] dark:bg-zinc-800/60 border-black/10 dark:border-zinc-700/50 text-zinc-700 dark:text-zinc-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]',
    indigo:
      'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_0_rgba(129,140,248,0.2)]',
    emerald:
      'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_0_rgba(52,211,153,0.2)]',
    amber:
      'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_0_rgba(251,191,36,0.2)]',
    rose:
      'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_0_rgba(251,113,133,0.2)]',
    cyan:
      'bg-cyan-50 dark:bg-cyan-500/15 border-cyan-200 dark:border-cyan-500/30 text-cyan-800 dark:text-cyan-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_0_rgba(34,211,238,0.2)]',
    purple:
      'bg-purple-50 dark:bg-purple-500/15 border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_0_0_rgba(192,132,252,0.2)]',
  };

  const dotColors = {
    neutral: 'bg-zinc-500 dark:bg-zinc-400',
    indigo: 'bg-indigo-600 dark:bg-indigo-400',
    emerald: 'bg-emerald-600 dark:bg-emerald-400',
    amber: 'bg-amber-600 dark:bg-amber-400',
    rose: 'bg-rose-600 dark:bg-rose-400',
    cyan: 'bg-cyan-600 dark:bg-cyan-400',
    purple: 'bg-purple-600 dark:bg-purple-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-md border transition-all select-none',
        styles[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span
              className={cn(
                'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                dotColors[variant]
              )}
            />
          )}
          <span
            className={cn('relative inline-flex rounded-full h-1.5 w-1.5', dotColors[variant])}
          />
        </span>
      )}
      {children}
    </span>
  );
};
