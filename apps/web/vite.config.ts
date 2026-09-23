import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/repos': {
        target: 'http://127.0.0.1:4317',
        changeOrigin: true,
      },
      '/runs': {
        target: 'http://127.0.0.1:4317',
        changeOrigin: true,
      },
      '/providers': {
        target: 'http://127.0.0.1:4317',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:4317',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'happy-dom',
  },
});
