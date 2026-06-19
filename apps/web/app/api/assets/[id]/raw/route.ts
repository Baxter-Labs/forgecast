import { getServices } from '@/lib/forgecast';
import { getAssetBytes } from '@/lib/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bytes = await getAssetBytes(getServices(), id);
  if (!bytes) return new Response('not found', { status: 404 });
  return new Response(bytes.data as unknown as BodyInit, {
    status: 200,
    headers: { 'content-type': bytes.contentType, 'cache-control': 'no-store' },
  });
}
