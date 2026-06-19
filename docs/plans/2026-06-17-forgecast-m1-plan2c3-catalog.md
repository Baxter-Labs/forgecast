# Forgecast M1 — Plan 2c-3: `@forgecast/catalog`

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A small package that loads + validates the harvested text-to-image model catalog into a typed `CatalogModel[]`, for the Studio's model picker (2c-4).

**Architecture:** Pure TS. `parseImageModels(raw)` maps the upstream `{ t2i: [...] }` schema to `CatalogModel[]`, skipping malformed entries. The package vendors the harvested data (MIT, derived from Open-Generative-AI's `models_dump.json`) and exports the parsed `imageModels`.

**Repo:** `~/Desktop/BaxterLabs/forgecast`. Harvested data is at `scratch/openmodels-t2i.json` (gitignored) — `{ "t2i": [ { id, name, inputs: { aspect_ratio: { enum: [...] }, ... } }, … ] }`, 51 models.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/catalog/package.json` · `tsconfig.json` | new `@forgecast/catalog` (resolveJsonModule) |
| `packages/catalog/data/openmodels-t2i.json` | vendored catalog (tracked; from scratch/) |
| `packages/catalog/data/SOURCE.md` | attribution note |
| `packages/catalog/src/types.ts` | `CatalogModel` |
| `packages/catalog/src/parse.ts` | `parseImageModels(raw): CatalogModel[]` |
| `packages/catalog/src/index.ts` | exports + loaded `imageModels` |
| `packages/catalog/test/parse.test.ts` · `catalog.test.ts` | tests |
| `vitest.config.ts` · `NOTICE` | alias + attribution |

---

## Task 1: Package + types + `parseImageModels`

**Files:** create `packages/catalog/{package.json,tsconfig.json,src/types.ts,src/parse.ts}`; modify `vitest.config.ts`; test `packages/catalog/test/parse.test.ts`.

- [ ] **Step 1: `packages/catalog/package.json`**

```json
{
  "name": "@forgecast/catalog",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "devDependencies": { "typescript": "^5.5.4" }
}
```

- [ ] **Step 2: `packages/catalog/tsconfig.json`** (JSON import needs `resolveJsonModule`)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "resolveJsonModule": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: add `@forgecast/catalog` alias to `vitest.config.ts`** (inside the existing `resolve.alias` block):

```ts
      '@forgecast/catalog': `${root}packages/catalog/src/index.ts`,
```

- [ ] **Step 4: run `pnpm install`** to register the new workspace package.

- [ ] **Step 5: `packages/catalog/src/types.ts`**

```ts
export interface CatalogModel {
  id: string;
  name: string;
  category: 'image';
  /** Allowed aspect ratios, when the upstream model declares them (else []). */
  aspectRatios: string[];
}
```

- [ ] **Step 6: failing test `packages/catalog/test/parse.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseImageModels } from '../src/parse';

const raw = {
  t2i: [
    { id: 'nano-banana', name: 'Nano Banana', inputs: { aspect_ratio: { enum: ['1:1', '16:9'] } } },
    { id: 'flux', name: 'FLUX', inputs: {} },
    { id: 42, name: 'bad-id' },
    { name: 'no-id' },
  ],
};

describe('parseImageModels', () => {
  it('maps valid t2i entries to CatalogModel and extracts aspect ratios', () => {
    const models = parseImageModels(raw);
    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({ id: 'nano-banana', name: 'Nano Banana', category: 'image', aspectRatios: ['1:1', '16:9'] });
    expect(models[1]).toEqual({ id: 'flux', name: 'FLUX', category: 'image', aspectRatios: [] });
  });

  it('returns [] for missing/invalid t2i', () => {
    expect(parseImageModels({})).toEqual([]);
    expect(parseImageModels(null)).toEqual([]);
    expect(parseImageModels({ t2i: 'nope' })).toEqual([]);
  });
});
```
Run `pnpm test packages/catalog/test/parse.test.ts` → confirm FAIL.

- [ ] **Step 7: implement `packages/catalog/src/parse.ts`**

```ts
import type { CatalogModel } from './types';

interface RawModel {
  id?: unknown;
  name?: unknown;
  inputs?: { aspect_ratio?: { enum?: unknown } };
}

export function parseImageModels(raw: unknown): CatalogModel[] {
  const t2i = (raw as { t2i?: unknown } | null)?.t2i;
  if (!Array.isArray(t2i)) return [];

  const models: CatalogModel[] = [];
  for (const entry of t2i as RawModel[]) {
    if (typeof entry?.id !== 'string' || typeof entry?.name !== 'string') continue;
    const enumVals = entry.inputs?.aspect_ratio?.enum;
    const aspectRatios = Array.isArray(enumVals)
      ? enumVals.filter((v): v is string => typeof v === 'string')
      : [];
    models.push({ id: entry.id, name: entry.name, category: 'image', aspectRatios });
  }
  return models;
}
```

- [ ] **Step 8: run the test (PASS, 2 tests); full `pnpm test`; `pnpm typecheck` clean.**

- [ ] **Step 9: commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(catalog): @forgecast/catalog package + parseImageModels"
```

---

## Task 2: Vendor the data + export `imageModels`

**Files:** create `packages/catalog/data/openmodels-t2i.json` (copied), `packages/catalog/data/SOURCE.md`, `packages/catalog/src/index.ts`; modify `NOTICE`; test `packages/catalog/test/catalog.test.ts`.

- [ ] **Step 1: Vendor the harvested data into the package (tracked):**

```bash
mkdir -p ~/Desktop/BaxterLabs/forgecast/packages/catalog/data
cp ~/Desktop/BaxterLabs/forgecast/scratch/openmodels-t2i.json ~/Desktop/BaxterLabs/forgecast/packages/catalog/data/openmodels-t2i.json
```
If `scratch/openmodels-t2i.json` is missing, re-harvest it:
```bash
cd /tmp && rm -rf ogai && git clone --depth 1 --filter=blob:none --no-checkout https://github.com/Anil-matcha/Open-Generative-AI ogai && cd ogai && git checkout HEAD -- models_dump.json && cp models_dump.json ~/Desktop/BaxterLabs/forgecast/packages/catalog/data/openmodels-t2i.json
```

- [ ] **Step 2: Create `packages/catalog/data/SOURCE.md`**

```md
# Catalog data source

`openmodels-t2i.json` is the text-to-image (`t2i`) model catalog extracted from
**Open-Generative-AI** (https://github.com/Anil-matcha/Open-Generative-AI),
MIT License, © Anil-matcha. Only the model metadata/schema is reused; no
generation code is vendored. See the repository root `NOTICE`.
```

- [ ] **Step 3: failing test `packages/catalog/test/catalog.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { imageModels } from '../src/index';

describe('imageModels (vendored catalog)', () => {
  it('loads many image models', () => {
    expect(imageModels.length).toBeGreaterThanOrEqual(40);
  });

  it('every model is well-formed', () => {
    for (const m of imageModels) {
      expect(typeof m.id).toBe('string');
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.name).toBe('string');
      expect(m.category).toBe('image');
      expect(Array.isArray(m.aspectRatios)).toBe(true);
    }
  });

  it('includes a known model id', () => {
    expect(imageModels.map((m) => m.id)).toContain('nano-banana');
  });
});
```
Run `pnpm test packages/catalog/test/catalog.test.ts` → confirm FAIL (no `src/index`).

- [ ] **Step 4: implement `packages/catalog/src/index.ts`**

```ts
import rawData from '../data/openmodels-t2i.json';
import { parseImageModels } from './parse';

export * from './types';
export * from './parse';

/** The vendored text-to-image catalog, parsed and validated at module load. */
export const imageModels = parseImageModels(rawData);
```

- [ ] **Step 5: Update the root `NOTICE`** — move Open-Generative-AI from "will integrate" to incorporated. Change its bullet to note actual incorporation:

```text
- Open-Generative-AI — Copyright (c) Anil-matcha — MIT License
  https://github.com/Anil-matcha/Open-Generative-AI
  (model catalog metadata vendored at packages/catalog/data/openmodels-t2i.json;
   no generation code used)
```
(Keep the MoneyPrinterTurbo and VibeVoice bullets as-is.)

- [ ] **Step 6: run the test (PASS, 3 tests); full `pnpm test`; `pnpm typecheck` clean.**

- [ ] **Step 7: commit**

```bash
git -C ~/Desktop/BaxterLabs/forgecast add -A
git -C ~/Desktop/BaxterLabs/forgecast commit -m "feat(catalog): vendor t2i model catalog + export imageModels"
```

---

## Definition of Done (2c-3)

- `@forgecast/catalog` exports `CatalogModel`, `parseImageModels`, and the loaded `imageModels` (≥40 models from the vendored data).
- Data is tracked at `packages/catalog/data/openmodels-t2i.json` with `SOURCE.md` + `NOTICE` attribution (MIT).
- Full `pnpm test` green; `pnpm typecheck` clean.
- Atomic conventional commits per task.

**Next:** 2c-4 — Image Studio UI (prompt + model picker from `imageModels` + generate + live job progress + gallery), via the frontend-design skill, consuming the 2c-2 routes.
