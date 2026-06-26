import { type AdCreativeMetrics, ctrOf, cpcOf, cpaOf } from './adinsights';
import { diagnoseFatigue, type CreativeFatigue } from './fatigue';

/**
 * Ad-account audit — a NotFair-style health check that scores a flat metrics list
 * across a few independent dimensions (CTR health, creative freshness, spend
 * efficiency, conversion rate, spend concentration) into a 0–100 grade with
 * concrete, prioritized recommendations. Pure: no clock, no network.
 */

export interface AuditDimension {
  key: string;
  label: string;
  /** 0–100. */
  score: number;
  weight: number;
  findings: string[];
}

export interface AdsAuditTotals {
  creatives: number;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  cpc: number | null;
  cpa: number | null;
}

export interface AdsAudit {
  /** Weighted overall health, 0–100. */
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  totals: AdsAuditTotals;
  dimensions: AuditDimension[];
  fatigue: CreativeFatigue[];
  recommendations: string[];
}

export interface AuditOptions {
  /** Healthy portfolio CTR (default 0.9%). */
  ctrBenchmark?: number;
  /** Healthy conversion rate, conversions / clicks (default 2%). */
  cvrBenchmark?: number;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[mid - 1]! + s[mid]!) / 2) : s[mid]!;
}

function gradeFor(score: number): AdsAudit['grade'] {
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
}

interface CreativeRollup {
  creativeId: string;
  name?: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}

function rollupByCreative(metrics: AdCreativeMetrics[]): CreativeRollup[] {
  const map = new Map<string, CreativeRollup>();
  for (const m of metrics) {
    let r = map.get(m.creativeId);
    if (!r) { r = { creativeId: m.creativeId, name: m.name, impressions: 0, clicks: 0, spend: 0, conversions: 0 }; map.set(m.creativeId, r); }
    r.impressions += m.impressions;
    r.clicks += m.clicks;
    r.spend += m.spend;
    if (typeof m.conversions === 'number') r.conversions += m.conversions;
    if (!r.name && m.name) r.name = m.name;
  }
  return [...map.values()];
}

/** Audit a flat list of per-creative, per-day metrics. */
export function auditAds(metrics: AdCreativeMetrics[], opts: AuditOptions = {}): AdsAudit {
  const ctrBenchmark = opts.ctrBenchmark ?? 0.009;
  const cvrBenchmark = opts.cvrBenchmark ?? 0.02;

  const impressions = metrics.reduce((s, m) => s + m.impressions, 0);
  const clicks = metrics.reduce((s, m) => s + m.clicks, 0);
  const spend = metrics.reduce((s, m) => s + m.spend, 0);
  const conversions = metrics.reduce((s, m) => s + (m.conversions ?? 0), 0);
  const hasConversions = metrics.some((m) => typeof m.conversions === 'number');

  const rollups = rollupByCreative(metrics);
  const fatigue = diagnoseFatigue(metrics);
  const totals: AdsAuditTotals = {
    creatives: rollups.length,
    impressions, clicks, spend, conversions,
    ctr: ctrOf({ impressions, clicks }),
    cpc: cpcOf({ clicks, spend }),
    cpa: hasConversions ? cpaOf({ conversions, spend }) : null,
  };

  const dimensions: AuditDimension[] = [];
  const recommendations: string[] = [];

  // 1) CTR health vs benchmark.
  {
    const ratio = ctrBenchmark > 0 ? totals.ctr / ctrBenchmark : 0;
    const score = clampScore(ratio * 70); // at benchmark → 70; 1.43× → 100.
    const findings = [`Portfolio CTR ${(totals.ctr * 100).toFixed(2)}% vs ${(ctrBenchmark * 100).toFixed(2)}% benchmark.`];
    if (score < 60) recommendations.push(`Lift CTR: portfolio is ${(totals.ctr * 100).toFixed(2)}%, below the ${(ctrBenchmark * 100).toFixed(2)}% benchmark — refresh hooks and creative.`);
    dimensions.push({ key: 'ctr_health', label: 'CTR health', score, weight: 0.25, findings });
  }

  // 2) Creative freshness — how much spend rides on fatigued creatives.
  {
    const fatigued = fatigue.filter((f) => f.status === 'fatigued');
    const watch = fatigue.filter((f) => f.status === 'watch');
    const fatiguedSpend = fatigued.reduce((s, f) => s + f.spend, 0);
    const load = spend > 0 ? fatiguedSpend / spend : 0;
    const score = clampScore((1 - load) * 100);
    const findings = [
      `${fatigued.length} fatigued, ${watch.length} to watch of ${fatigue.length} creative(s).`,
      `${(load * 100).toFixed(0)}% of spend is on fatigued creatives.`,
    ];
    if (fatigued.length > 0) {
      recommendations.push(`Refresh ${fatigued.length} fatigued creative(s) carrying ${(load * 100).toFixed(0)}% of spend (${fatiguedSpend.toFixed(0)}).`);
    }
    dimensions.push({ key: 'creative_freshness', label: 'Creative freshness', score, weight: 0.3, findings });
  }

  // 3) Spend efficiency — budget sitting on costly creatives vs the median.
  {
    const costs = rollups.map((r) => (hasConversions
      ? (r.conversions > 0 ? r.spend / r.conversions : Infinity)
      : (r.clicks > 0 ? r.spend / r.clicks : Infinity)));
    const finiteCosts = costs.filter((c) => Number.isFinite(c));
    const med = median(finiteCosts);
    let inefficientSpend = 0;
    const offenders: string[] = [];
    rollups.forEach((r, i) => {
      const c = costs[i]!;
      if (med > 0 && (c === Infinity || c > med * 1.5) && r.spend > 0) {
        inefficientSpend += r.spend;
        if (offenders.length < 3) offenders.push(r.name ?? r.creativeId);
      }
    });
    const share = spend > 0 ? inefficientSpend / spend : 0;
    const score = clampScore((1 - share) * 100);
    const unit = hasConversions ? 'CPA' : 'CPC';
    const findings = [`${(share * 100).toFixed(0)}% of spend on creatives with ${unit} > 1.5× the ${med.toFixed(2)} median.`];
    if (offenders.length > 0) {
      recommendations.push(`Trim or pause high-${unit} creatives: ${offenders.join(', ')} (${(share * 100).toFixed(0)}% of spend).`);
    }
    dimensions.push({ key: 'spend_efficiency', label: 'Spend efficiency', score, weight: 0.2, findings });
  }

  // 4) Conversion rate (only when conversions are tracked).
  if (hasConversions) {
    const cvr = clicks > 0 ? conversions / clicks : 0;
    const ratio = cvrBenchmark > 0 ? cvr / cvrBenchmark : 0;
    const score = clampScore(ratio * 70);
    const findings = [`Conversion rate ${(cvr * 100).toFixed(2)}% vs ${(cvrBenchmark * 100).toFixed(2)}% benchmark.`];
    if (score < 60) recommendations.push(`Improve conversion rate (${(cvr * 100).toFixed(2)}%): check landing-page relevance and offer.`);
    dimensions.push({ key: 'conversion_rate', label: 'Conversion rate', score, weight: 0.15, findings });
  }

  // 5) Spend concentration — single-creative risk.
  {
    const topSpend = rollups.reduce((mx, r) => Math.max(mx, r.spend), 0);
    const share = spend > 0 ? topSpend / spend : 0;
    // 1 creative is fine; with several, heavy concentration is a risk.
    const score = rollups.length <= 1 ? 100 : clampScore((1 - Math.max(0, share - 0.5) / 0.5) * 100);
    const findings = [`Top creative carries ${(share * 100).toFixed(0)}% of spend across ${rollups.length} creative(s).`];
    if (rollups.length > 1 && share > 0.6) recommendations.push(`Diversify: ${(share * 100).toFixed(0)}% of spend is on one creative — add fresh variants to de-risk.`);
    dimensions.push({ key: 'spend_concentration', label: 'Spend concentration', score, weight: 0.1, findings });
  }

  const weightSum = dimensions.reduce((s, d) => s + d.weight, 0);
  const score = weightSum > 0 ? clampScore(dimensions.reduce((s, d) => s + d.score * d.weight, 0) / weightSum) : 0;

  if (recommendations.length === 0) recommendations.push('Healthy account — keep feeding fresh creative to stay ahead of fatigue.');

  return { score, grade: gradeFor(score), totals, dimensions, fatigue, recommendations };
}
