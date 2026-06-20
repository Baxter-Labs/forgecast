import type { LlmClient } from '@forgecast/agent';

export interface OpenAiLlmOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface ChatResp { choices?: Array<{ message?: { content?: string } }> }

export class OpenAiLlmClient implements LlmClient {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: OpenAiLlmOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = opts.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    this.baseUrl = (opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(input: { system: string; user: string }): Promise<string> {
    if (!this.apiKey) throw new Error('LLM not configured (set OPENAI_API_KEY)');
    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }],
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as ChatResp;
    return data.choices?.[0]?.message?.content ?? '';
  }
}
