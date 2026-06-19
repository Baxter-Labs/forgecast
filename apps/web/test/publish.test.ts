import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { publishAsset } from '../lib/api';

const saved = process.env.OMNISOCIALS_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.OMNISOCIALS_API_KEY;
  else process.env.OMNISOCIALS_API_KEY = saved;
});

function omniOk() {
  return vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(JSON.stringify({ id: 'post_1', status: 'publishing' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

async function seedAsset(svc: ReturnType<typeof buildServices>) {
  const { newProject, newAsset } = await import('@forgecast/core');
  await svc.projects.create(newProject({ name: 'P' }, { id: 'p1', now: 'T' }));
  await svc.assets.create(newAsset({ projectId: 'p1', type: 'image', provider: 'fal', storageKey: 'k.png' }, { id: 'a1', now: 'T' }));
}

describe('publishAsset', () => {
  it('404 for a missing asset', async () => {
    delete process.env.OMNISOCIALS_API_KEY;
    const r = await publishAsset(buildServices({ falKey: 'k' }), 'nope', { content: 'x' });
    expect(r.status).toBe(404);
  });

  it('400 without content', async () => {
    process.env.OMNISOCIALS_API_KEY = 'k';
    const svc = buildServices({ falKey: 'k', fetchFn: omniOk() });
    await seedAsset(svc);
    expect((await publishAsset(svc, 'a1', {})).status).toBe(400);
  });

  it('503 when no publisher is configured', async () => {
    delete process.env.OMNISOCIALS_API_KEY;
    const svc = buildServices({ falKey: 'k' });
    await seedAsset(svc);
    expect((await publishAsset(svc, 'a1', { content: 'x' })).status).toBe(503);
  });

  it('publishes via omnisocials when configured', async () => {
    process.env.OMNISOCIALS_API_KEY = 'k';
    const fetchFn = omniOk();
    const svc = buildServices({ falKey: 'k', fetchFn });
    await seedAsset(svc);
    const r = await publishAsset(svc, 'a1', { content: 'check this out', channels: ['instagram'] });
    expect(r.status).toBe(200);
    expect((r.body as { published: { postId: string } }).published.postId).toBe('post_1');
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.omnisocials.com/v1/posts/create-and-publish');
  });
});
