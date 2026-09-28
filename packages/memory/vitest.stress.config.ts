import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/stress.test.ts'],
    testTimeout: 120000,
  },
});
