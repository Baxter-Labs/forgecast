import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { MontageSpec } from './timeline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Remotion needs a webpack-compatible require in some code paths
const require = createRequire(import.meta.url);
void require; // silence unused-var lint

/**
 * Render a MontageSpec to an mp4 file at `outFile`.
 *
 * Note: the FIRST call to this function will download a headless Chromium
 * (~1-2 min). Pre-warm with:
 *   npx remotion browser ensure
 */
export async function renderMontage(spec: MontageSpec, outFile: string): Promise<void> {
  const entryPoint = join(__dirname, 'index.ts');

  const serveUrl = await bundle({ entryPoint });

  const composition = await selectComposition({
    serveUrl,
    id: 'Montage',
    inputProps: { spec },
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outFile,
    inputProps: { spec },
  });
}
