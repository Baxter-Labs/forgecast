export interface MollieClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface CreatePaymentInput {
  amount: string;        // e.g. "9.00"
  currency?: string;     // default EUR
  description: string;
  redirectUrl: string;
  webhookUrl?: string;
}

export interface MolliePayment {
  paymentId: string;
  status: string;
  paid: boolean;
  checkoutUrl?: string;
}

interface MollieResp {
  id?: string;
  status?: string;
  _links?: { checkout?: { href?: string } };
  detail?: string;
}

export class MollieError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'MollieError'; }
}

export class MollieClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: MollieClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.MOLLIE_API_KEY;
    this.baseUrl = (opts.baseUrl ?? 'https://api.mollie.com/v2').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean { return Boolean(this.apiKey); }

  async createPayment(input: CreatePaymentInput): Promise<MolliePayment> {
    const data = await this.req('/payments', {
      method: 'POST',
      body: JSON.stringify({
        amount: { currency: input.currency ?? 'EUR', value: input.amount },
        description: input.description,
        redirectUrl: input.redirectUrl,
        ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
      }),
    });
    return this.toPayment(data);
  }

  async getPayment(id: string): Promise<MolliePayment> {
    return this.toPayment(await this.req(`/payments/${id}`));
  }

  private toPayment(d: MollieResp): MolliePayment {
    const status = d.status ?? 'unknown';
    return { paymentId: d.id ?? '', status, paid: status === 'paid', checkoutUrl: d._links?.checkout?.href };
  }

  private async req(path: string, init?: RequestInit): Promise<MollieResp> {
    if (!this.apiKey) throw new MollieError(0, 'Mollie not configured (set MOLLIE_API_KEY)');
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    let body: MollieResp = {};
    if (text) { try { body = JSON.parse(text) as MollieResp; } catch { body = {}; } }
    if (!res.ok) throw new MollieError(res.status, body.detail ?? `Mollie request failed (${res.status})`);
    return body;
  }
}
