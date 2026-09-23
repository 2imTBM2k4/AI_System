import React from 'react';

/**
 * Calm parchment backdrop inspired by Perplexity AI.
 * Deliberately subtle and flat with a warm paper tone and fine texture.
 */
export const AmbientBackdrop: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 overflow-hidden pointer-events-none z-0 transition-opacity duration-500"
    >
      {/* Serene ultra-faint warm tint at top center */}
      <div
        className="absolute -top-[10%] left-[25%] w-[50%] h-[350px] rounded-full opacity-40 dark:opacity-10 blur-[120px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(209, 209, 205, 0.4) 0%, rgba(250, 248, 245, 0) 70%)',
        }}
      />

      {/* Subtle fine dot grid texture */}
      <div
        className="absolute inset-0 opacity-[0.025] dark:opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(currentColor 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />
    </div>
  );
};

