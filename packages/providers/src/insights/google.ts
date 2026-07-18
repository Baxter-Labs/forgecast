import type { AdCreativeMetrics, AdsInsightsProvider } from '@forgecast/core';

export interface GoogleAdsInsightsOptions {
  developerToken?: string;
  /** OAuth access token (the refresh dance is the operator's to run). Falls back to GOOGLE_ADS_ACCESS_TOKEN. */
  accessToken?: string;
  /** Target customer id (digits only). Falls back to GOOGLE_ADS_CUSTOMER_ID. */
  customerId?: string;
  /** Manager (MCC) id for login-customer-id header. Falls back to GOOGLE_ADS_LOGIN_CUSTOMER_ID. */
  loginCustomerId?: string;
  /** API version, e.g. `v21`. Falls back to GOOGLE_ADS_API_VERSION (bump as Google sunsets versions). */
  version?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface GoogleAdRow {
  adGroupAd?: { ad?: { id?: string; name?: string } };
  metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number | string };
  segments?: { date?: string };
}
interface GoogleSearchBatch { results?: GoogleAdRow[] }
interface GoogleError { error?: { message?: string; status?: string } }

function num(v: string | number | undefined): number {
  const n = v === undefined ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const GAQL =
  'SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, metrics.impressions, metrics.clicks, ' +
  'metrics.cost_micros, metrics.conversions, segments.date FROM ad_group_ad';

/**
 * Pulls per-ad, per-day metrics from the Google Ads API via `googleAds:searchStream`
 * (GAQL over `ad_group_ad`). Raw injectable fetch, no SDK. Configure with
 * GOOGLE_ADS_DEVELOPER_TOKEN + GOOGLE_ADS_ACCESS_TOKEN + GOOGLE_ADS_CUSTOMER_ID.
 */
export class GoogleAdsInsightsProvider implements AdsInsightsProvider {
  readonly name = 'google';
  private readonly developerToken: string | undefined;
  private readonly accessToken: string | undefined;
  private readonly customerId: string | undefined;
  private readonly loginCustomerId: string | undefined;
  private readonly version: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: GoogleAdsInsightsOptions = {}) {
    this.developerToken = opts.developerToken ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    this.accessToken = opts.accessToken ?? process.env.GOOGLE_ADS_ACCESS_TOKEN;
    this.customerId = (opts.customerId ?? process.env.GOOGLE_ADS_CUSTOMER_ID)?.replace(/-/g, '');
    this.loginCustomerId = (opts.loginCustomerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)?.replace(/-/g, '');
    this.version = opts.version ?? process.env.GOOGLE_ADS_API_VERSION ?? 'v21';
    this.baseUrl = (opts.baseUrl ?? 'https://googleads.googleapis.com').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.developerToken && this.accessToken && this.customerId);
  }

  async fetchInsights(input: { sinceDays?: number } = {}): Promise<AdCreativeMetrics[]> {
    if (!this.isAvailable()) {
      throw new Error('Google Ads not configured (set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_ACCESS_TOKEN and GOOGLE_ADS_CUSTOMER_ID)');
    }
    const sinceDays = input.sinceDays ?? 14;
    const during = sinceDays <= 7 ? 'LAST_7_DAYS' : sinceDays <= 14 ? 'LAST_14_DAYS' : 'LAST_30_DAYS';
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'developer-token': this.developerToken!,
      'Content-Type': 'application/json',
    };
    if (this.loginCustomerId) headers['login-customer-id'] = this.loginCustomerId;

    const res = await this.fetchFn(`${this.baseUrl}/${this.version}/customers/${this.customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: `${GAQL} DURING ${during}` }),
    });
    const body = (await res.json().catch(() => ({}))) as GoogleSearchBatch[] | GoogleError;
    if (!res.ok) {
      const msg = (body as GoogleError).error?.message ?? 'unknown error';
      throw new Error(`Google Ads insights failed (${res.status}): ${msg}`);
    }

    // searchStream returns an array of batches, each with a `results` array.
    const batches = Array.isArray(body) ? body : [];
    const rows: AdCreativeMetrics[] = [];
    for (const batch of batches) {
      for (const r of batch.results ?? []) {
        rows.push({
          creativeId: r.adGroupAd?.ad?.id ?? 'unknown',
          name: r.adGroupAd?.ad?.name,
          platform: 'google',
          date: r.segments?.date ?? '',
          impressions: num(r.metrics?.impressions),
          clicks: num(r.metrics?.clicks),
          spend: num(r.metrics?.costMicros) / 1_000_000,
          conversions: num(r.metrics?.conversions),
        });
      }
    }
    return rows;
  }
}
