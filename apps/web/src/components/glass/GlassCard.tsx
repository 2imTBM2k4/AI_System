import React from 'react';
import { cn } from '../../lib/utils';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'interactive' | 'glow-indigo' | 'glow-amber' | 'glow-emerald' | 'glow-rose';
  specular?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className,
  variant = 'default',
  specular = true,
  ...props
}) => {
  const variantStyles = {
    default:
      'bg-white/70 dark:bg-zinc-900/40 backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_8px_30px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]',
    elevated:
      'bg-white/85 dark:bg-zinc-900/60 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.12] shadow-[0_16px_36px_rgba(0,0,0,0.08)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)]',
    interactive:
      'liquid-glass-card cursor-pointer',
    'glow-indigo':
      'bg-indigo-50/70 dark:bg-indigo-950/20 backdrop-blur-xl border border-indigo-500/25 dark:border-indigo-500/30 shadow-[0_0_25px_rgba(99,102,241,0.08)] dark:shadow-[0_0_30px_rgba(99,102,241,0.15)]',
    'glow-amber':
      'bg-amber-50/70 dark:bg-amber-950/20 backdrop-blur-xl border border-amber-500/25 dark:border-amber-500/30 shadow-[0_0_25px_rgba(245,158,11,0.08)] dark:shadow-[0_0_30px_rgba(245,158,11,0.15)]',
    'glow-emerald':
      'bg-emerald-50/70 dark:bg-emerald-950/20 backdrop-blur-xl border border-emerald-500/25 dark:border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.08)] dark:shadow-[0_0_30px_rgba(16,185,129,0.15)]',
    'glow-rose':
      'bg-rose-50/70 dark:bg-rose-950/20 backdrop-blur-xl border border-rose-500/25 dark:border-rose-500/30 shadow-[0_0_25px_rgba(244,63,94,0.08)] dark:shadow-[0_0_30px_rgba(244,63,94,0.15)]',
  };

  return (
    <div
      className={cn(
        'rounded-2xl relative overflow-hidden transition-all duration-200',
        variantStyles[variant],
        specular && 'specular-border',
        className
      )}
      {...props}
    >
      {/* Specular edge reflection overlay */}
      {specular && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 dark:via-white/20 to-transparent pointer-events-none"
        />
      )}
      {children}
    </div>
  );
};
