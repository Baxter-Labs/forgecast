import { describe, it, expect } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, uploadAsset } from '../lib/api';

async function projectId() {
  const svc = buildServices({ falKey: 'k' });
  const created = await createProject(svc, { name: 'UploadTest' });
  return { svc, pid: (created.body as { project: { id: string } }).project.id };
}

describe('api: uploadAsset', () => {
  it('creates an image asset for image/png bytes', async () => {
    const { svc, pid } = await projectId();
    const bytes = new Uint8Array([137, 80, 78, 71]); // PNG header bytes
    const r = await uploadAsset(svc, pid, { bytes, contentType: 'image/png', filename: 'test.png' });
    expect(r.status).toBe(201);
    const body = r.body as { asset: { type: string; provider: string; params: Record<string, unknown> } };
    expect(body.asset.type).toBe('image');
    expect(body.asset.provider).toBe('upload');
    expect(body.asset.params.uploaded).toBe(true);
    expect(body.asset.params.filename).toBe('test.png');
  });

  it('creates a video asset for video/mp4 bytes', async () => {
    const { svc, pid } = await projectId();
    const bytes = new Uint8Array([0, 0, 0, 20]); // minimal mp4-ish bytes
    const r = await uploadAsset(svc, pid, { bytes, contentType: 'video/mp4', filename: 'clip.mp4' });
    expect(r.status).toBe(201);
    const body = r.body as { asset: { type: string } };
    expect(body.asset.type).toBe('video');
  });

  it('returns 400 for empty bytes', async () => {
    const { svc, pid } = await projectId();
    const r = await uploadAsset(svc, pid, { bytes: new Uint8Array(0), contentType: 'image/png' });
    expect(r.status).toBe(400);
  });

  it('returns 400 for unknown content-type', async () => {
    const { svc, pid } = await projectId();
    const bytes = new Uint8Array([1, 2, 3]);
    const r = await uploadAsset(svc, pid, { bytes, contentType: 'application/pdf' });
    expect(r.status).toBe(400);
    const body = r.body as { error: string };
    expect(body.error).toBe('only image or video uploads are supported');
  });

  it('returns 404 for missing project', async () => {
    const svc = buildServices({ falKey: 'k' });
    const bytes = new Uint8Array([1, 2, 3]);
    const r = await uploadAsset(svc, 'nonexistent', { bytes, contentType: 'image/png' });
    expect(r.status).toBe(404);
  });
});
