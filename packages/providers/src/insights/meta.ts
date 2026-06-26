import type { AdCreativeMetrics, AdsInsightsProvider } from '@forgecast/core';

export interface MetaAdsInsightsOptions {
  accessToken?: string;
  /** Ad account id, with or without the `act_` prefix. Falls back to META_ADS_ACCOUNT_ID. */
  accountId?: string;
  /** Graph API version, e.g. `v21.0`. Falls back to META_GRAPH_VERSION. */
  version?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface MetaAction { action_type?: string; value?: string }
interface MetaInsightRow {
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  frequency?: string;
  actions?: MetaAction[];
}
interface MetaInsightsResp {
  data?: MetaInsightRow[];
  paging?: { next?: string };
  error?: { message?: string; type?: string; code?: number };
}

// Action types that count as a conversion for CPA purposes.
const CONVERSION_ACTIONS = new Set([
  'purchase',
  'lead',
  'complete_registration',
  'offsite_conversion.fb_pixel_purchase',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.purchase',
]);

function num(v: string | undefined): number {
  const n = v === undefined ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pulls per-ad, per-day metrics from the Meta (Facebook/Instagram) Marketing API's
 * Insights edge. Raw injectable fetch, no SDK — same shape as every Forgecast
 * provider, so it's offline-mock-testable and Workers-friendly. Configure with
 * META_ADS_ACCESS_TOKEN + META_ADS_ACCOUNT_ID.
 */
export class MetaAdsInsightsProvider implements AdsInsightsProvider {
  readonly name = 'meta';
  private readonly accessToken: string | undefined;
  private readonly accountId: string | undefined;
  private readonly version: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: MetaAdsInsightsOptions = {}) {
    this.accessToken = opts.accessToken ?? process.env.META_ADS_ACCESS_TOKEN;
    const acct = opts.accountId ?? process.env.META_ADS_ACCOUNT_ID;
    this.accountId = acct ? (acct.startsWith('act_') ? acct : `act_${acct}`) : undefined;
    this.version = opts.version ?? process.env.META_GRAPH_VERSION ?? 'v21.0';
    this.baseUrl = (opts.baseUrl ?? 'https://graph.facebook.com').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.accessToken && this.accountId);
  }

  async fetchInsights(input: { sinceDays?: number } = {}): Promise<AdCreativeMetrics[]> {
    if (!this.isAvailable()) throw new Error('Meta Ads not configured (set META_ADS_ACCESS_TOKEN and META_ADS_ACCOUNT_ID)');
    const sinceDays = input.sinceDays ?? 14;
    const datePreset = sinceDays <= 7 ? 'last_7d' : sinceDays <= 14 ? 'last_14d' : sinceDays <= 30 ? 'last_30d' : 'last_90d';
    const params = new URLSearchParams({
      level: 'ad',
      time_increment: '1',
      fields: 'ad_id,ad_name,impressions,clicks,spend,frequency,actions',
      date_preset: datePreset,
      limit: '500',
      access_token: this.accessToken!,
    });

    let url: string | undefined = `${this.baseUrl}/${this.version}/${this.accountId}/insights?${params.toString()}`;
    const rows: AdCreativeMetrics[] = [];
    let pages = 0;
    while (url && pages < 20) {
      const res = await this.fetchFn(url);
      const data = (await res.json().catch(() => ({}))) as MetaInsightsResp;
      if (!res.ok || data.error) {
        throw new Error(`Meta Ads insights failed (${res.status}): ${data.error?.message ?? 'unknown error'}`);
      }
      for (const r of data.data ?? []) {
        const conversions = (r.actions ?? [])
          .filter((a) => a.action_type && CONVERSION_ACTIONS.has(a.action_type))
          .reduce((s, a) => s + num(a.value), 0);
        rows.push({
          creativeId: r.ad_id ?? 'unknown',
          name: r.ad_name,
          platform: 'meta',
          date: r.date_start ?? '',
          impressions: num(r.impressions),
          clicks: num(r.clicks),
          spend: num(r.spend),
          conversions,
          frequency: r.frequency !== undefined ? num(r.frequency) : undefined,
        });
      }
      url = data.paging?.next;
      pages += 1;
    }
    return rows;
  }
}
