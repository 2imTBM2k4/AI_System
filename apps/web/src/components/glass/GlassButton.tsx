import React from 'react';
import { cn } from '../../lib/utils';

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'teal' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  glow?: boolean;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  children,
  className,
  variant = 'secondary',
  size = 'md',
  glow = false,
  disabled,
  ...props
}) => {
  const sizeStyles = {
    sm: 'px-2.5 py-1 text-xs gap-1.5 rounded-lg font-medium',
    md: 'px-3.5 py-2 text-xs font-medium gap-2 rounded-xl',
    lg: 'px-5 py-2.5 text-sm font-medium gap-2.5 rounded-xl',
  };

  const variantStyles = {
    primary:
      'bg-[var(--color-ink)] text-[var(--color-parchment)] hover:opacity-90 active:scale-[0.98] border border-transparent shadow-none',
    teal:
      'bg-[var(--color-deep-teal)] text-white hover:bg-[var(--color-deep-teal-hover)] active:scale-[0.98] border border-transparent shadow-none',
    secondary:
      'bg-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-[var(--text-primary)] border border-[var(--color-warm-mist)]',
    ghost:
      'bg-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.04] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--color-warm-mist)] rounded-md',
    success:
      'bg-emerald-600 hover:bg-emerald-500 text-white border border-transparent',
    danger:
      'bg-rose-600 hover:bg-rose-500 text-white border border-transparent',
  };

  return (
    <button
      disabled={disabled}
      className={cn(
        'relative inline-flex items-center justify-center transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none overflow-hidden',
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

