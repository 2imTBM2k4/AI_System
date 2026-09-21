import React from 'react';
import { cn } from '../../lib/utils';

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
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
    sm: 'px-2.5 py-1 text-xs gap-1.5 rounded-lg',
    md: 'px-4 py-2 text-xs font-semibold gap-2 rounded-xl',
    lg: 'px-6 py-2.5 text-xs font-bold gap-2.5 rounded-xl tracking-wide uppercase',
  };

  const variantStyles = {
    primary:
      'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/30',
    secondary:
      'bg-black/[0.04] hover:bg-black/[0.08] text-zinc-800 border-black/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)] dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:text-zinc-200 dark:hover:text-white dark:border-white/[0.1] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]',
    success:
      'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/25 border border-emerald-400/30',
    danger:
      'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-lg shadow-rose-600/25 border border-rose-400/30',
    ghost:
      'bg-transparent hover:bg-black/[0.05] dark:hover:bg-white/[0.05] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent',
  };

  return (
    <button
      disabled={disabled}
      className={cn(
        'relative inline-flex items-center justify-center backdrop-blur-md transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none overflow-hidden',
        sizeStyles[size],
        variantStyles[variant],
        glow && 'hover:scale-[1.02]',
        className
      )}
      {...props}
    >
      {/* Specular sheen effect */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 dark:via-white/30 to-transparent pointer-events-none"
      />
      {children}
    </button>
  );
};
