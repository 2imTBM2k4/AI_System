import React from 'react';
import { cn } from '../../lib/utils';

export interface GlassBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'teal' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'purple';
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
      'bg-black/[0.03] dark:bg-white/[0.04] border border-[var(--color-warm-mist)] text-[var(--text-secondary)]',
    teal:
      'bg-[var(--color-deep-teal)] border border-[var(--color-deep-teal)] text-white',
    indigo:
      'bg-[var(--color-deep-teal)]/10 dark:bg-[var(--color-deep-teal)]/20 border border-[var(--color-deep-teal)]/30 text-[var(--color-deep-teal)] dark:text-teal-300',
    emerald:
      'bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    amber:
      'bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 text-amber-800 dark:text-amber-300',
    rose:
      'bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 text-rose-700 dark:text-rose-300',
    cyan:
      'bg-cyan-500/10 dark:bg-cyan-500/20 border border-cyan-500/30 text-cyan-800 dark:text-cyan-300',
    purple:
      'bg-purple-500/10 dark:bg-purple-500/20 border border-purple-500/30 text-purple-700 dark:text-purple-300',
  };

  const dotColors = {
    neutral: 'bg-[var(--color-graphite)]',
    teal: 'bg-white',
    indigo: 'bg-[var(--color-deep-teal)]',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    cyan: 'bg-cyan-500',
    purple: 'bg-purple-500',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all select-none',
        styles[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
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

