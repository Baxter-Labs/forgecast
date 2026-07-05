import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateImage } from '../lib/api';
import type { ImageProvider } from '@forgecast/core';

function makeServices() {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }),
  );
  const svc = buildServices({ falKey: 'k', fetchFn });
  const provider: ImageProvider = { name: 'fal', isAvailable: () => true, async generateImage() { return { url: 'https://cdn/x.png' }; } };
  svc.imageRegistry.register(provider);
  return svc;
}

async function newProjectId(svc: ReturnType<typeof buildServices>): Promise<string> {
  const r = await createProject(svc, { name: 'Guard Test' });
  return (r.body as { project: { id: string } }).project.id;
}

const savedBlocklist = process.env.CONTENT_BLOCKLIST;
afterEach(() => {
  if (savedBlocklist === undefined) delete process.env.CONTENT_BLOCKLIST;
  else process.env.CONTENT_BLOCKLIST = savedBlocklist;
});

describe('content guardrails on generateImage', () => {
  it('blocks a disallowed prompt with a 400 and a category', async () => {
    const svc = makeServices();
    const pid = await newProjectId(svc);
    const r = await generateImage(svc, pid, { prompt: 'a naked child' });
    expect(r.status).toBe(400);
    expect((r.body as { error: string; category?: string }).category).toBe('sexual_minors');
    expect((r.body as { error: string }).error).toMatch(/content policy/i);
  });

  it('allows an ordinary prompt through', async () => {
    const svc = makeServices();
    const pid = await newProjectId(svc);
    const r = await generateImage(svc, pid, { prompt: 'a glowing anvil in a dark smithy' });
    expect(r.status).toBe(200);
  });

  it('honours the operator CONTENT_BLOCKLIST env', async () => {
    process.env.CONTENT_BLOCKLIST = 'acmerival, forbidden';
    const svc = makeServices();
    const pid = await newProjectId(svc);
    expect((await generateImage(svc, pid, { prompt: 'promote AcmeRival today' })).status).toBe(400);
    expect((await generateImage(svc, pid, { prompt: 'a totally fine prompt' })).status).toBe(200);
  });
});
