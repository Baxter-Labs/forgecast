import { getServices } from '@/lib/forgecast';
import { getAssetBytes } from '@/lib/api';

// content-type → file extension, so a downloaded file lands with a sensible name.
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bytes = await getAssetBytes(getServices(), id);
  if (!bytes) return new Response('not found', { status: 404 });

  const headers: Record<string, string> = {
    'content-type': bytes.contentType,
    'cache-control': 'no-store',
  };

  // ?download=1 turns the response into a saved file rather than an inline view.
  if (new URL(req.url).searchParams.get('download') != null) {
    const ext = EXT_BY_TYPE[bytes.contentType] ?? bytes.contentType.split('/')[1] ?? 'bin';
    headers['content-disposition'] = `attachment; filename="forgecast-${id}.${ext}"`;
  }

  return new Response(bytes.data as unknown as BodyInit, { status: 200, headers });
}
