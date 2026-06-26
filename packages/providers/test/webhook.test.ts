import { describe, it, expect, vi } from 'vitest';
import { PublishError } from '@forgecast/core';
import { WebhookPublisher } from '../src/publish/webhook';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('WebhookPublisher', () => {
  it('isAvailable reflects a configured URL', () => {
    expect(new WebhookPublisher({ url: undefined }).isAvailable()).toBe(false);
    expect(new WebhookPublisher({ url: 'https://hook.example/x' }).isAvailable()).toBe(true);
  });

  it('POSTs the post payload (content + channels + media) with the bearer secret', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ id: 'evt_1', status: 'queued' }));
    const pub = new WebhookPublisher({ url: 'https://hook.example/post', secret: 's3cr3t', fetchFn });

    const r = await pub.publish({ content: 'Launch 🚀', channels: ['twitter', 'linkedin'], mediaUrls: ['https://cdn/x.png'] });
    expect(r).toMatchObject({ postId: 'evt_1', status: 'queued' });

    const [url, init] = fetchFn.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://hook.example/post');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer s3cr3t');
    expect(JSON.parse(init.body as string)).toEqual({
      source: 'forgecast',
      content: 'Launch 🚀',
      channels: ['twitter', 'linkedin'],
      mediaUrls: ['https://cdn/x.png'],
    });
  });

  it('treats a bare 200 as delivered and omits the bearer header when no secret', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response('', { status: 200 }));
    const pub = new WebhookPublisher({ url: 'https://hook.example/post', fetchFn });
    const r = await pub.publish({ content: 'hi' });
    expect(r.status).toBe('delivered');
    expect(r.postId).toBe('webhook-delivered');
    expect((fetchFn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>).not.toHaveProperty('Authorization');
  });

  it('throws PublishError on a non-2xx response', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response('nope', { status: 500 }));
    const pub = new WebhookPublisher({ url: 'https://hook.example/post', fetchFn });
    await expect(pub.publish({ content: 'hi' })).rejects.toBeInstanceOf(PublishError);
  });

  it('throws when unconfigured', async () => {
    await expect(new WebhookPublisher({ url: undefined }).publish({ content: 'hi' })).rejects.toBeInstanceOf(PublishError);
  });
});
