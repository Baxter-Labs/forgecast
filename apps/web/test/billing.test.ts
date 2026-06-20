import { describe, it, expect, vi } from 'vitest';
import { MollieClient, MollieError } from '../lib/billing/mollie';
import { isPro, markPaid, _resetEntitlements } from '../lib/billing/entitlements';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('MollieClient', () => {
  it('is unavailable without a key and throws on use', async () => {
    const c = new MollieClient({ apiKey: undefined });
    expect(c.isAvailable()).toBe(false);
    await expect(c.getPayment('tr_1')).rejects.toBeInstanceOf(MollieError);
  });

  it('creates a payment and returns the checkout url', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ id: 'tr_1', status: 'open', _links: { checkout: { href: 'https://pay.mollie/tr_1' } } }, 201),
    );
    const c = new MollieClient({ apiKey: 'test_x', fetchFn });
    const p = await c.createPayment({ amount: '9.00', description: 'Pro', redirectUrl: 'http://app/ok' });
    expect(p).toMatchObject({ paymentId: 'tr_1', status: 'open', paid: false, checkoutUrl: 'https://pay.mollie/tr_1' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.mollie.com/v2/payments');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test_x' });
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.amount).toEqual({ currency: 'EUR', value: '9.00' });
  });

  it('reports paid status', async () => {
    const c = new MollieClient({ apiKey: 'test_x', fetchFn: vi.fn(async () => json({ id: 'tr_1', status: 'paid' })) });
    expect((await c.getPayment('tr_1')).paid).toBe(true);
  });
});

describe('entitlements', () => {
  it('grants Pro once a payment is marked paid', () => {
    _resetEntitlements();
    expect(isPro()).toBe(false);
    markPaid('tr_1');
    expect(isPro()).toBe(true);
    _resetEntitlements();
  });
});
