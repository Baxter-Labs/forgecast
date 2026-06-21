import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Like } from '@forgecast/store';

/**
 * Returns the D1 binding (`DB`) from the Cloudflare Workers runtime, or null when
 * running off-Workers (Node tests, `next build`, local non-Worker dev). Access is
 * guarded: `getCloudflareContext()` throws outside an initialized Worker request,
 * so callers transparently fall back to other persistence.
 */
export function getD1Binding(): D1Like | null {
  try {
    const env = getCloudflareContext().env as unknown as { DB?: D1Like };
    return env.DB ?? null;
  } catch {
    return null;
  }
}

/**
 * Keeps a long-running background task (e.g. a video job) alive after the HTTP
 * response is sent. On Cloudflare Workers an unawaited promise is cancelled once
 * the response returns, so async jobs must be registered via `ctx.waitUntil`.
 * Off-Workers (Node), the event loop keeps the promise running on its own.
 */
export function runBackground(task: Promise<unknown>): void {
  const safe = task.catch(() => {});
  try {
    getCloudflareContext().ctx.waitUntil(safe);
  } catch {
    void safe;
  }
}
