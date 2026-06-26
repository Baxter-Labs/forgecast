import { type AdCreativeMetrics, ctrOf, cpcOf, cpaOf } from './adinsights';

/**
 * Creative-fatigue diagnosis. A creative "fatigues" as the audience that will
 * respond to it gets exhausted: CTR decays from its early baseline, impression
 * frequency climbs (the same people see it again and again), and cost per result
 * drifts up. We compare a recent window against the earlier baseline and combine
 * those signals into a 0–1 score and a status. Pure and deterministic — no clock,
 * no network — so the same series always yields the same verdict.
 */

export type FatigueStatus = 'fresh' | 'watch' | 'fatigued' | 'insufficient_data';

export interface FatigueWindow {
  days: number;
  impressions: number;
  spend: number;
  ctr: number;
  cpc: number | null;
  cpa: number | null;
  frequency: number | null;
}

export interface CreativeFatigue {
  creativeId: string;
  name?: string;
  status: FatigueStatus;
  /** 0 (fresh) … 1 (badly fatigued). */
  score: number;
  reasons: string[];
  baseline: FatigueWindow;
  recent: FatigueWindow;
  /** Total spend over the whole series — used to weight portfolio-level impact. */
  spend: number;
}

export interface FatigueOptions {
  /** Size of the recent window in days (default 3). */
  recentDays?: number;
  /** Minimum days of data required to judge (default 6). */
  minDays?: number;
  /** Minimum total impressions required to judge (default 1000). */
  minImpressions?: number;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function aggregate(rows: AdCreativeMetrics[]): FatigueWindow {
  let impressions = 0, clicks = 0, spend = 0, conversions = 0;
  const freqs: number[] = [];
  for (const r of rows) {
    impressions += r.impressions;
    clicks += r.clicks;
    spend += r.spend;
    if (typeof r.conversions === 'number') conversions += r.conversions;
    if (typeof r.frequency === 'number') freqs.push(r.frequency);
  }
  const agg = { impressions, clicks, spend, conversions };
  return {
    days: rows.length,
    impressions,
    spend,
    ctr: ctrOf({ impressions, clicks }),
    cpc: cpcOf({ clicks, spend }),
    cpa: cpaOf({ conversions, spend }),
    frequency: freqs.length > 0 ? freqs.reduce((a, b) => a + b, 0) / freqs.length : null,
  };
}

/** Diagnose fatigue for a single creative's day-by-day series. */
export function diagnoseCreativeFatigue(series: AdCreativeMetrics[], opts: FatigueOptions = {}): CreativeFatigue {
  const recentDays = opts.recentDays ?? 3;
  const minDays = opts.minDays ?? 6;
  const minImpressions = opts.minImpressions ?? 1000;

  const rows = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const creativeId = rows[0]?.creativeId ?? series[0]?.creativeId ?? 'unknown';
  const name = rows.find((r) => r.name)?.name;
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);

  const whole = aggregate(rows);

  // Not enough signal to judge — say so rather than guess.
  if (rows.length < minDays || totalImpressions < minImpressions || rows.length <= recentDays) {
    return {
      creativeId, name, status: 'insufficient_data', score: 0,
      reasons: [`Not enough data yet (${rows.length} day(s), ${totalImpressions.toLocaleString()} impressions).`],
      baseline: whole, recent: whole, spend: totalSpend,
    };
  }

  const recentRows = rows.slice(-recentDays);
  const baselineRows = rows.slice(0, rows.length - recentDays);
  const recent = aggregate(recentRows);
  const baseline = aggregate(baselineRows);

  const reasons: string[] = [];

  // 1) CTR decay vs baseline — the primary signal.
  const ctrDecay = baseline.ctr > 0 ? (baseline.ctr - recent.ctr) / baseline.ctr : 0;
  if (ctrDecay > 0.05) reasons.push(`CTR fell ${pct(ctrDecay)} (from ${pct(baseline.ctr)} to ${pct(recent.ctr)}).`);

  // 2) Rising cost per result (CPA preferred, else CPC).
  let costRise = 0;
  if (baseline.cpa !== null && recent.cpa !== null && baseline.cpa > 0) {
    costRise = (recent.cpa - baseline.cpa) / baseline.cpa;
    if (costRise > 0.1) reasons.push(`CPA rose ${pct(costRise)} (from ${baseline.cpa.toFixed(2)} to ${recent.cpa.toFixed(2)}).`);
  } else if (baseline.cpc !== null && recent.cpc !== null && baseline.cpc > 0) {
    costRise = (recent.cpc - baseline.cpc) / baseline.cpc;
    if (costRise > 0.1) reasons.push(`CPC rose ${pct(costRise)} (from ${baseline.cpc.toFixed(2)} to ${recent.cpc.toFixed(2)}).`);
  }

  // 3) Frequency saturation — the same people seeing it repeatedly.
  const freq = recent.frequency;
  if (freq !== null && freq >= 2) reasons.push(`Frequency at ${freq.toFixed(1)} — the audience is seeing it repeatedly.`);

  // Combine into a 0–1 fatigue score: a 50% CTR decay (or cost rise) maxes out its
  // component, so a clearly fatigued creative lands well above the 0.5 line.
  let score = clamp01(ctrDecay / 0.5) * 0.6 + clamp01(costRise / 0.5) * 0.25;
  if (freq !== null) score += freq >= 3.5 ? 0.15 : freq >= 3 ? 0.12 : freq >= 2.5 ? 0.08 : freq >= 2 ? 0.04 : 0;
  score = clamp01(score);

  let status: FatigueStatus;
  if (score >= 0.5 || ctrDecay >= 0.35) status = 'fatigued';
  else if (score >= 0.25 || ctrDecay >= 0.2 || (freq !== null && freq >= 2.5)) status = 'watch';
  else status = 'fresh';

  if (reasons.length === 0) reasons.push('Holding steady — no fatigue signals.');

  return { creativeId, name, status, score: Math.round(score * 100) / 100, reasons, baseline, recent, spend: totalSpend };
}

/** Group a flat metrics list by creative and diagnose each. Sorted worst-first. */
export function diagnoseFatigue(metrics: AdCreativeMetrics[], opts?: FatigueOptions): CreativeFatigue[] {
  const byCreative = new Map<string, AdCreativeMetrics[]>();
  for (const m of metrics) {
    const arr = byCreative.get(m.creativeId);
    if (arr) arr.push(m);
    else byCreative.set(m.creativeId, [m]);
  }
  return [...byCreative.values()]
    .map((series) => diagnoseCreativeFatigue(series, opts))
    .sort((a, b) => b.score - a.score);
}
