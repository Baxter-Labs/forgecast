import { getServices } from '@/lib/forgecast';
import { getCharacterRefBytes } from '@/lib/api';

/**
 * Serves a character's reference portrait bytes. Public by design (like
 * /api/assets/:id/raw): generation providers (fal etc.) fetch these URLs
 * server-side; ids are unguessable UUIDs.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; idx: string }> }) {
  const { id, idx } = await ctx.params;
  const index = Number.parseInt(idx, 10);
  if (!Number.isInteger(index) || index < 0) return new Response('not found', { status: 404 });
  const bytes = await getCharacterRefBytes(getServices(), id, index);
  if (!bytes) return new Response('not found', { status: 404 });
  return new Response(bytes.data as unknown as BodyInit, {
    headers: { 'content-type': bytes.contentType, 'cache-control': 'no-store' },
  });
}
