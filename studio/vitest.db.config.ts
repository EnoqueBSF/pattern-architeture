import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/db/**/*.test.ts'],
    environment: 'node',
    // sem paralelismo entre arquivos: todos compartilham o mesmo banco pattern_catalog_test, e
    // truncam as tabelas entre testes -- rodar em paralelo causaria corrida entre truncates
    fileParallelism: false,
  },
});
