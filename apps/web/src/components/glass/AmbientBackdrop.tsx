import React from 'react';

/**
 * Ambient chromatic lighting orbs floating behind the layout
 * providing colorful refraction for all frosted glass panels.
 * Adapts between Dark (neon obsidian) and Light (soft pastel crystal) modes.
 */
export const AmbientBackdrop: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 overflow-hidden pointer-events-none z-0 transition-opacity duration-500"
    >
      {/* Top Indigo Aurora */}
      <div
        className="absolute -top-[15%] left-[20%] w-[600px] h-[500px] rounded-full opacity-25 dark:opacity-20 blur-[130px] mix-blend-multiply dark:mix-blend-screen transition-all duration-500"
        style={{
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.7) 0%, rgba(79, 70, 229, 0) 70%)',
        }}
      />

      {/* Top-Right Violet Glow */}
      <div
        className="absolute top-[5%] -right-[10%] w-[550px] h-[550px] rounded-full opacity-20 dark:opacity-15 blur-[140px] mix-blend-multiply dark:mix-blend-screen transition-all duration-500"
        style={{
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.6) 0%, rgba(147, 51, 234, 0) 70%)',
        }}
      />

      {/* Center-Left Cyan Glow */}
      <div
        className="absolute top-[40%] -left-[10%] w-[500px] h-[500px] rounded-full opacity-20 dark:opacity-15 blur-[120px] mix-blend-multiply dark:mix-blend-screen transition-all duration-500"
        style={{
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.6) 0%, rgba(14, 165, 233, 0) 70%)',
        }}
      />

      {/* Bottom Emerald/Teal Glow */}
      <div
        className="absolute -bottom-[15%] right-[25%] w-[650px] h-[450px] rounded-full opacity-15 dark:opacity-10 blur-[140px] mix-blend-multiply dark:mix-blend-screen transition-all duration-500"
        style={{
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.6) 0%, rgba(5, 150, 105, 0) 70%)',
        }}
      />

      {/* Subtle fine dot grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(currentColor 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />
    </div>
  );
};
