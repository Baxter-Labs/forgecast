import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@forgecast/core': `${root}packages/core/src/index.ts`,
      '@forgecast/providers': `${root}packages/providers/src/index.ts`,
      '@forgecast/store': `${root}packages/store/src/index.ts`,
    },
  },
  test: {
    environment: 'node',
    // Tests live inside packages (which are type-checked by `pnpm typecheck`).
    // Avoid a root-level `test/` glob so no test escapes the strict tsc gate.
    include: ['{packages,apps,workers}/*/test/**/*.test.ts'],
  },
});
