import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * node:sqlite is a Node >=22.5 built-in that Vite 5 doesn't know about yet.
 * The builtinModules list contains "node:sqlite" (with prefix) but Vite's
 * internal nodeBuiltins list filters those out, leaving only unprefixed names.
 * This plugin intercepts the bare "sqlite" id (after Vite strips the "node:"
 * prefix) and returns a synthetic ESM re-export so Vite can process the module
 * without trying to read a file from disk.
 */
const nodeSqlitePlugin: Plugin = {
  name: 'node-sqlite-external',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'node:sqlite' || id === 'sqlite') {
      return '\0node:sqlite';
    }
    return undefined;
  },
  load(id) {
    if (id === '\0node:sqlite') {
      // Use createRequire to load the real built-in — avoids Vite re-intercepting
      // an `import 'node:sqlite'` statement inside the synthetic module.
      return [
        `import { createRequire } from 'node:module';`,
        `const _r = createRequire(import.meta.url);`,
        `const _m = _r('node:sqlite');`,
        `export const DatabaseSync = _m.DatabaseSync;`,
        `export const StatementSync = _m.StatementSync;`,
        `export const Session = _m.Session;`,
        `export const constants = _m.constants;`,
        `export default _m;`,
      ].join('\n');
    }
    return undefined;
  },
};

export default defineConfig({
  plugins: [nodeSqlitePlugin],
  resolve: {
    alias: {
      '@forgecast/core': `${root}packages/core/src/index.ts`,
      '@forgecast/providers': `${root}packages/providers/src/index.ts`,
      '@forgecast/store': `${root}packages/store/src/index.ts`,
      '@forgecast/jobs': `${root}packages/jobs/src/index.ts`,
      '@forgecast/catalog': `${root}packages/catalog/src/index.ts`,
      '@forgecast/agent': `${root}packages/agent/src/index.ts`,
    },
  },
  test: {
    environment: 'node',
    // Tests live inside packages (which are type-checked by `pnpm typecheck`).
    // Avoid a root-level `test/` glob so no test escapes the strict tsc gate.
    include: ['{packages,apps,workers}/*/test/**/*.test.ts'],
  },
});
