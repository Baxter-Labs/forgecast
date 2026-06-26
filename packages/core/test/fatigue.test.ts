import { describe, it, expect } from 'vitest';
import { diagnoseCreativeFatigue, diagnoseFatigue, auditAds, type AdCreativeMetrics } from '../src/index';

/** Build a day-by-day series with a linear CTR ramp from startCtr → endCtr. */
function series(
  creativeId: string,
  days: number,
  startCtr: number,
  endCtr: number,
  opts: { imprPerDay?: number; freqStart?: number; freqEnd?: number; cpcStart?: number; cpcEnd?: number; name?: string } = {},
): AdCreativeMetrics[] {
  const imprPerDay = opts.imprPerDay ?? 1000;
  const out: AdCreativeMetrics[] = [];
  for (let i = 0; i < days; i++) {
    const t = days > 1 ? i / (days - 1) : 0;
    const ctr = startCtr + (endCtr - startCtr) * t;
    const clicks = Math.round(imprPerDay * ctr);
    const cpc = opts.cpcStart !== undefined && opts.cpcEnd !== undefined ? opts.cpcStart + (opts.cpcEnd - opts.cpcStart) * t : 1;
    const day = String(i + 1).padStart(2, '0');
    const row: AdCreativeMetrics = {
      creativeId,
      name: opts.name,
      platform: 'meta',
      date: `2026-06-${day}`,
      impressions: imprPerDay,
      clicks,
      spend: Math.round(clicks * cpc * 100) / 100,
    };
    if (opts.freqStart !== undefined && opts.freqEnd !== undefined) {
      row.frequency = Math.round((opts.freqStart + (opts.freqEnd - opts.freqStart) * t) * 10) / 10;
    }
    out.push(row);
  }
  return out;
}

describe('diagnoseCreativeFatigue', () => {
  it('flags a sharp CTR decay as fatigued', () => {
    const f = diagnoseCreativeFatigue(series('c1', 10, 0.03, 0.012, { freqStart: 1.2, freqEnd: 3.4 }));
    expect(f.status).toBe('fatigued');
    expect(f.score).toBeGreaterThan(0.5);
    expect(f.reasons.join(' ')).toMatch(/CTR fell/);
  });

  it('calls a steady high-CTR creative fresh', () => {
    const f = diagnoseCreativeFatigue(series('c2', 10, 0.025, 0.024, { freqStart: 1.1, freqEnd: 1.4 }));
    expect(f.status).toBe('fresh');
    expect(f.score).toBeLessThan(0.25);
  });

  it('returns insufficient_data when there are too few days', () => {
    const f = diagnoseCreativeFatigue(series('c3', 3, 0.03, 0.02));
    expect(f.status).toBe('insufficient_data');
  });

  it('returns insufficient_data below the impression floor', () => {
    const f = diagnoseCreativeFatigue(series('c4', 10, 0.03, 0.01, { imprPerDay: 50 }));
    expect(f.status).toBe('insufficient_data');
  });

  it('flags a moderate decay as watch', () => {
    const f = diagnoseCreativeFatigue(series('c5', 12, 0.02, 0.013, { freqStart: 1.2, freqEnd: 1.8 }));
    expect(f.status).toBe('watch');
  });

  it('reports rising CPA when conversions are present', () => {
    const rows = series('c6', 10, 0.02, 0.018);
    rows.forEach((r, i) => { r.conversions = i < 7 ? 20 : 4; }); // conversions collapse late → CPA spikes
    const f = diagnoseCreativeFatigue(rows);
    expect(f.reasons.join(' ')).toMatch(/CPA rose/);
  });
});

describe('diagnoseFatigue (grouping)', () => {
  it('groups by creative and sorts worst-first', () => {
    const all = [
      ...series('fresh', 10, 0.025, 0.024),
      ...series('tired', 10, 0.03, 0.01, { freqStart: 1.5, freqEnd: 3.5 }),
    ];
    const out = diagnoseFatigue(all);
    expect(out).toHaveLength(2);
    expect(out[0]!.creativeId).toBe('tired');
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score);
  });
});

describe('auditAds', () => {
  const metrics = [
    ...series('a', 10, 0.03, 0.011, { name: 'Hero A', freqStart: 1.4, freqEnd: 3.6, imprPerDay: 2000 }),
    ...series('b', 10, 0.024, 0.023, { name: 'Hero B', imprPerDay: 1500 }),
  ];

  it('produces a 0–100 score, a grade, totals and every dimension', () => {
    const a = auditAds(metrics);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(a.grade);
    expect(a.totals.creatives).toBe(2);
    const keys = a.dimensions.map((d) => d.key);
    expect(keys).toContain('ctr_health');
    expect(keys).toContain('creative_freshness');
    expect(keys).toContain('spend_efficiency');
    expect(keys).toContain('spend_concentration');
  });

  it('recommends refreshing the fatigued creative', () => {
    const a = auditAds(metrics);
    expect(a.fatigue.some((f) => f.creativeId === 'a' && f.status === 'fatigued')).toBe(true);
    expect(a.recommendations.join(' ')).toMatch(/[Rr]efresh/);
  });

  it('adds a conversion-rate dimension only when conversions are tracked', () => {
    const withConv = metrics.map((m) => ({ ...m, conversions: Math.round(m.clicks * 0.03) }));
    expect(auditAds(metrics).dimensions.some((d) => d.key === 'conversion_rate')).toBe(false);
    expect(auditAds(withConv).dimensions.some((d) => d.key === 'conversion_rate')).toBe(true);
  });
});
