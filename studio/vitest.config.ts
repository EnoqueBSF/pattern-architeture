import { defaultExclude, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [...defaultExclude, 'test/db/**'],
    environment: 'node',
  },
});
