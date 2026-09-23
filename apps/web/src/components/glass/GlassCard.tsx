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
  specular = false,
  ...props
}) => {
  const variantStyles = {
    default:
      'bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[var(--shadow-subtle)] text-[var(--text-primary)]',
    elevated:
      'bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.4)] text-[var(--text-primary)]',
    interactive:
      'bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[var(--shadow-subtle)] hover:border-[var(--color-deep-teal)]/40 hover:-translate-y-0.5 cursor-pointer text-[var(--text-primary)]',
    'glow-indigo':
      'bg-[var(--card-bg)] border border-[var(--color-deep-teal)]/30 text-[var(--text-primary)]',
    'glow-amber':
      'bg-amber-500/[0.04] dark:bg-amber-500/10 border border-amber-500/30 text-[var(--text-primary)]',
    'glow-emerald':
      'bg-emerald-500/[0.04] dark:bg-emerald-500/10 border border-emerald-500/30 text-[var(--text-primary)]',
    'glow-rose':
      'bg-rose-500/[0.04] dark:bg-rose-500/10 border border-rose-500/30 text-[var(--text-primary)]',
  };

  return (
    <div
      className={cn(
        'rounded-2xl relative overflow-hidden transition-all duration-200',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

