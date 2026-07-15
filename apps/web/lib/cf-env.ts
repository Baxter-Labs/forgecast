import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Like, R2BucketLike } from '@forgecast/store';
import type { WorkersAiRunner } from '@forgecast/providers';

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
 * Returns the Workers AI binding (`AI`) from the Cloudflare runtime, or null when
 * running off-Workers (Node tests, `next build`, local dev). Mirrors getD1Binding:
 * getCloudflareContext() throws outside a Worker request, so callers transparently
 * fall back to the REST path (or a BYO-key provider).
 */
export function getAiBinding(): WorkersAiRunner | null {
  try {
    const env = getCloudflareContext().env as unknown as { AI?: WorkersAiRunner };
    return env.AI ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the R2 bucket binding (`MEDIA_BUCKET`) from the Cloudflare runtime, or
 * null off-Workers. Mirrors getD1Binding/getAiBinding. Powers the keyless media
 * store (no S3 access keys) for the baxter-cloud profile.
 */
export function getMediaBucket(): R2BucketLike | null {
  try {
    const env = getCloudflareContext().env as unknown as { MEDIA_BUCKET?: R2BucketLike };
    return env.MEDIA_BUCKET ?? null;
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
