import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@forgecast/core': `${root}packages/core/src/index.ts`,
      '@forgecast/providers': `${root}packages/providers/src/index.ts`,
    },
  },
  test: {
    environment: 'node',
    include: ['**/test/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
