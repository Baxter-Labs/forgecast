import { describe, it, expect, vi } from 'vitest';
import { MetaAdsInsightsProvider, GoogleAdsInsightsProvider, AdsInsightsRegistry } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('MetaAdsInsightsProvider', () => {
  it('isAvailable needs a token and account', () => {
    expect(new MetaAdsInsightsProvider({ accessToken: undefined, accountId: undefined }).isAvailable()).toBe(false);
    expect(new MetaAdsInsightsProvider({ accessToken: 't', accountId: '123' }).isAvailable()).toBe(true);
  });

  it('normalizes ad/day rows and sums conversion actions', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({
        data: [
          {
            ad_id: '1', ad_name: 'Hero', date_start: '2026-06-01',
            impressions: '1000', clicks: '20', spend: '15.50', frequency: '1.8',
            actions: [{ action_type: 'purchase', value: '3' }, { action_type: 'link_click', value: '20' }],
          },
        ],
      }),
    );
    const p = new MetaAdsInsightsProvider({ accessToken: 't', accountId: '123', fetchFn });
    const rows = await p.fetchInsights({ sinceDays: 7 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ creativeId: '1', name: 'Hero', platform: 'meta', date: '2026-06-01', impressions: 1000, clicks: 20, spend: 15.5, conversions: 3, frequency: 1.8 });
    // act_ prefix added, date_preset derived from sinceDays
    const url = fetchFn.mock.calls[0]![0] as string;
    expect(url).toContain('/act_123/insights');
    expect(url).toContain('date_preset=last_7d');
  });

  it('follows paging.next until exhausted', async () => {
    const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) => {
      const u = String(a[0]);
      if (!u.includes('after=')) return json({ data: [{ ad_id: '1', date_start: '2026-06-01', impressions: '10', clicks: '1', spend: '1' }], paging: { next: 'https://graph.facebook.com/next?after=ABC' } });
      return json({ data: [{ ad_id: '2', date_start: '2026-06-02', impressions: '20', clicks: '2', spend: '2' }] });
    });
    const p = new MetaAdsInsightsProvider({ accessToken: 't', accountId: 'act_123', fetchFn });
    const rows = await p.fetchInsights();
    expect(rows.map((r) => r.creativeId)).toEqual(['1', '2']);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws on an API error', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ error: { message: 'bad token' } }, 401));
    const p = new MetaAdsInsightsProvider({ accessToken: 't', accountId: '123', fetchFn });
    await expect(p.fetchInsights()).rejects.toThrow(/Meta Ads insights failed/);
  });
});

describe('GoogleAdsInsightsProvider', () => {
  it('isAvailable needs dev token, access token and customer id', () => {
    expect(new GoogleAdsInsightsProvider({ developerToken: 'd', accessToken: 'a', customerId: undefined }).isAvailable()).toBe(false);
    expect(new GoogleAdsInsightsProvider({ developerToken: 'd', accessToken: 'a', customerId: '123' }).isAvailable()).toBe(true);
  });

  it('maps searchStream batches and converts cost_micros to spend', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json([
        { results: [
          { adGroupAd: { ad: { id: '11', name: 'Search A' } }, metrics: { impressions: '500', clicks: '25', costMicros: '7500000', conversions: 4 }, segments: { date: '2026-06-01' } },
        ] },
        { results: [
          { adGroupAd: { ad: { id: '12', name: 'Search B' } }, metrics: { impressions: '300', clicks: '9', costMicros: '3000000', conversions: 1 }, segments: { date: '2026-06-01' } },
        ] },
      ]),
    );
    const p = new GoogleAdsInsightsProvider({ developerToken: 'd', accessToken: 'a', customerId: '123-456-7890', fetchFn });
    const rows = await p.fetchInsights({ sinceDays: 14 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ creativeId: '11', name: 'Search A', platform: 'google', impressions: 500, clicks: 25, spend: 7.5, conversions: 4 });
    const [url, init] = fetchFn.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/customers/1234567890/googleAds:searchStream'); // dashes stripped
    expect((init.headers as Record<string, string>)['developer-token']).toBe('d');
    expect(JSON.parse(init.body as string).query).toContain('DURING LAST_14_DAYS');
  });

  it('throws on an API error', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ error: { message: 'PERMISSION_DENIED' } }, 403));
    const p = new GoogleAdsInsightsProvider({ developerToken: 'd', accessToken: 'a', customerId: '123', fetchFn });
    await expect(p.fetchInsights()).rejects.toThrow(/Google Ads insights failed/);
  });
});

describe('AdsInsightsRegistry', () => {
  it('registers, looks up, and lists available providers', () => {
    const reg = new AdsInsightsRegistry();
    reg.register(new MetaAdsInsightsProvider({ accessToken: 't', accountId: '1' }));
    reg.register(new GoogleAdsInsightsProvider({ developerToken: undefined, accessToken: undefined, customerId: undefined }));
    expect(reg.has('meta')).toBe(true);
    expect(reg.get('meta').name).toBe('meta');
    expect(reg.available()).toEqual(['meta']); // google unconfigured
    expect(() => reg.get('nope')).toThrow(/Unknown ads-insights provider/);
  });
});
