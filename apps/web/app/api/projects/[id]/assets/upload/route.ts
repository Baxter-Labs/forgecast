import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { uploadAsset } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'no file' }, { status: 400 });
  }
  const bytes = new Uint8Array(await (file as Blob).arrayBuffer());
  const contentType = (file as Blob).type || 'application/octet-stream';
  const filename = (file as File).name;
  const r = await uploadAsset(getServices(), id, { bytes, contentType, filename });
  return NextResponse.json(r.body, { status: r.status });
}
