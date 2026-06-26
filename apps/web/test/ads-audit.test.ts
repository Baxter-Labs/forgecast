import { describe, it, expect, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { getAdsInsights, runAdsAudit } from '../lib/api';
import type { AdCreativeMetrics } from '@forgecast/core';

function makeServices() {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response('', { status: 200 }));
  return buildServices({ fetchFn });
}

/** A small 8-day series for one creative with a CTR ramp. */
function series(creativeId: string, startCtr: number, endCtr: number, name?: string): AdCreativeMetrics[] {
  const out: AdCreativeMetrics[] = [];
  for (let i = 0; i < 8; i++) {
    const ctr = startCtr + (endCtr - startCtr) * (i / 7);
    out.push({ creativeId, name, platform: 'meta', date: `2026-06-0${i + 1}`, impressions: 2000, clicks: Math.round(2000 * ctr), spend: 30 });
  }
  return out;
}

describe('runAdsAudit (provided metrics, keyless)', () => {
  it('audits caller-provided metrics and returns scores + fatigue + recommendations', async () => {
    const svc = makeServices();
    const metrics = [...series('a', 0.03, 0.011, 'Hero A'), ...series('b', 0.024, 0.023, 'Hero B')];
    const r = await runAdsAudit(svc, { metrics });
    expect(r.status).toBe(200);
    const body = r.body as { source: string; audit: { score: number; grade: string; dimensions: unknown[]; fatigue: Array<{ creativeId: string; status: string }>; recommendations: string[] } };
    expect(body.source).toBe('provided');
    expect(body.audit.score).toBeGreaterThanOrEqual(0);
    expect(body.audit.dimensions.length).toBeGreaterThan(0);
    expect(body.audit.fatigue.some((f) => f.creativeId === 'a' && f.status === 'fatigued')).toBe(true);
    expect(body.audit.recommendations.length).toBeGreaterThan(0);
  });

  it('400s when the metrics array has no valid rows', async () => {
    const svc = makeServices();
    const r = await runAdsAudit(svc, { metrics: [{ nope: 1 }] });
    expect(r.status).toBe(400);
  });

  it('503s when no metrics are provided and no source is configured', async () => {
    const svc = makeServices();
    const r = await runAdsAudit(svc, {});
    expect(r.status).toBe(503);
  });
});

describe('getAdsInsights', () => {
  it('echoes provided metrics with a count', async () => {
    const svc = makeServices();
    const r = await getAdsInsights(svc, { metrics: series('a', 0.02, 0.02) });
    expect(r.status).toBe(200);
    const body = r.body as { source: string; count: number; metrics: unknown[] };
    expect(body.source).toBe('provided');
    expect(body.count).toBe(8);
  });

  it('503s without a configured source', async () => {
    const svc = makeServices();
    const r = await getAdsInsights(svc, { source: 'meta' });
    expect(r.status).toBe(503);
  });
});
