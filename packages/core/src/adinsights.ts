/**
 * Ad-performance insights — the "measure" side of the loop. A normalized, source-
 * agnostic shape for ad metrics (one row per creative per day) plus the provider
 * contract that pulls them from a live ad platform (Meta, Google Ads, …). The
 * fatigue and audit analyzers consume this shape, so they work identically whether
 * the numbers come from a connected account or are handed in directly (keyless).
 */

/** Metrics for one creative on one day, normalized across ad platforms. */
export interface AdCreativeMetrics {
  /** Stable id of the ad/creative. */
  creativeId: string;
  name?: string;
  /** Source platform, e.g. 'meta' | 'google'. */
  platform?: string;
  /** ISO calendar day, `YYYY-MM-DD`. */
  date: string;
  impressions: number;
  clicks: number;
  /** Spend in the account currency. */
  spend: number;
  conversions?: number;
  /** Average impressions per person (Meta); used as a saturation signal when present. */
  frequency?: number;
}

/** A live source of ad metrics (a connected ad account). */
export interface AdsInsightsProvider {
  readonly name: string;
  isAvailable(): boolean;
  /** Pull per-creative, per-day metrics for the last `sinceDays` days (default 14). */
  fetchInsights(input?: { sinceDays?: number }): Promise<AdCreativeMetrics[]>;
}

/** Click-through rate; 0 when there were no impressions. */
export function ctrOf(m: { impressions: number; clicks: number }): number {
  return m.impressions > 0 ? m.clicks / m.impressions : 0;
}

/** Cost per click; null when there were no clicks. */
export function cpcOf(m: { clicks: number; spend: number }): number | null {
  return m.clicks > 0 ? m.spend / m.clicks : null;
}

/** Cost per acquisition; null when there were no conversions. */
export function cpaOf(m: { conversions?: number; spend: number }): number | null {
  return m.conversions && m.conversions > 0 ? m.spend / m.conversions : null;
}

/** True when a row carries the minimum fields needed to be analyzable. */
export function isAdCreativeMetrics(v: unknown): v is AdCreativeMetrics {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.creativeId === 'string' &&
    typeof m.date === 'string' &&
    typeof m.impressions === 'number' &&
    typeof m.clicks === 'number' &&
    typeof m.spend === 'number'
  );
}
