import type { LlmChatMessage, LlmClient, LlmTool, LlmToolCall } from '@forgecast/agent';

export interface OpenAiLlmOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface ChatResp { choices?: Array<{ message?: { content?: string } }> }

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments?: string };
}
interface ToolChatResp {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }>;
}

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

  /** Tool-calling turn: maps to/from OpenAI's function-calling Chat Completions shape. */
  async chat(input: { messages: LlmChatMessage[]; tools: LlmTool[] }): Promise<{ content: string; toolCalls: LlmToolCall[] }> {
    if (!this.apiKey) throw new Error('LLM not configured (set OPENAI_API_KEY)');

    const tools = input.tools.map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const messages = input.messages.map((m) => {
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant' as const,
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.argumentsJson },
          })),
        };
      }
      if (m.role === 'tool') {
        return { role: 'tool' as const, tool_call_id: m.toolCallId, content: m.content };
      }
      return { role: m.role, content: m.content };
    });

    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages, tools, tool_choice: 'auto', temperature: 0.7 }),
    });
    if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as ToolChatResp;
    const message = data.choices?.[0]?.message;
    return {
      content: message?.content ?? '',
      toolCalls: (message?.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function.name,
        argumentsJson: c.function.arguments ?? '{}',
      })),
    };
  }
}

// ── Anthropic (Claude) ──────────────────────────────────────────────────────────

export interface AnthropicLlmOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | { type: string };
interface AnthropicMessageResp { content?: AnthropicContentBlock[] }

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8';
const ANTHROPIC_MAX_TOKENS = 16000;

/**
 * Claude (Anthropic Messages API) implementation of the agent's LlmClient — the
 * default "brain" for the Forgecast agent.
 *
 * Raw injectable fetch, matching every other Forgecast provider, so the agent stays
 * offline-mock-testable and Cloudflare-Workers friendly (no SDK dependency). Note:
 * Opus 4.8 removed `temperature`/`top_p`/`top_k` (they return 400), so none is sent;
 * the `system` prompt is a top-level field and tool results are `tool_result` blocks
 * inside a user message — both different from OpenAI's chat shape.
 */
export class AnthropicLlmClient implements LlmClient {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: AnthropicLlmOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
    // Base is the host; the `/v1` lives in the path (matches the official SDK and
    // tolerates ANTHROPIC_BASE_URL being set with or without a trailing /v1).
    this.baseUrl = (opts.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com')
      .replace(/\/+$/, '')
      .replace(/\/v1$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.apiKey ?? '',
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    };
  }

  private textOf(content: AnthropicContentBlock[] | undefined): string {
    return (content ?? [])
      .filter((b): b is AnthropicTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  async complete(input: { system: string; user: string }): Promise<string> {
    if (!this.apiKey) throw new Error('LLM not configured (set ANTHROPIC_API_KEY)');
    const res = await this.fetchFn(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
      }),
    });
    if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as AnthropicMessageResp;
    return this.textOf(data.content);
  }

  async chat(input: { messages: LlmChatMessage[]; tools: LlmTool[] }): Promise<{ content: string; toolCalls: LlmToolCall[] }> {
    if (!this.apiKey) throw new Error('LLM not configured (set ANTHROPIC_API_KEY)');

    // Anthropic tools carry the JSON Schema for their args under `input_schema`.
    const tools = input.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

    // Anthropic has no `system` role inside messages (it's top-level), and a tool
    // result is a `tool_result` block inside a USER message — so translate.
    const systemParts: string[] = [];
    const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];

    const pushUserBlock = (block: unknown) => {
      const last = messages[messages.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        (last.content as unknown[]).push(block);
      } else {
        messages.push({ role: 'user', content: [block] });
      }
    };

    for (const m of input.messages) {
      if (m.role === 'system') {
        if (m.content) systemParts.push(m.content);
      } else if (m.role === 'tool') {
        pushUserBlock({ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content });
      } else if (m.role === 'assistant') {
        const blocks: unknown[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const tc of m.toolCalls ?? []) {
          let parsed: unknown;
          try { parsed = JSON.parse(tc.argumentsJson); } catch { parsed = {}; }
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: parsed });
        }
        messages.push({ role: 'assistant', content: blocks.length > 0 ? blocks : (m.content || '') });
      } else {
        pushUserBlock({ type: 'text', text: m.content });
      }
    }

    const body: Record<string, unknown> = { model: this.model, max_tokens: ANTHROPIC_MAX_TOKENS, messages, tools };
    if (systemParts.length > 0) body.system = systemParts.join('\n\n');

    const res = await this.fetchFn(`${this.baseUrl}/v1/messages`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as AnthropicMessageResp;
    return {
      content: this.textOf(data.content),
      toolCalls: (data.content ?? [])
        .filter((b): b is AnthropicToolUseBlock => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, argumentsJson: JSON.stringify(b.input ?? {}) })),
    };
  }
}

/**
 * The agent's LLM. OpenAI is the default; Claude (Anthropic) is opt-in via
 * `FORGECAST_AGENT_LLM=anthropic` (or `claude`), and a free, self-hosted local
 * model via **Ollama** is opt-in with `FORGECAST_AGENT_LLM=ollama` (or `local`).
 *
 * Selection is explicit on purpose — we do NOT auto-switch just because some key
 * happens to be in the ambient environment, so a key meant for something else
 * can't silently start billing the agent.
 *
 * Ollama (https://github.com/ollama/ollama) speaks the OpenAI Chat Completions
 * shape at `${OLLAMA_URL}/v1`, including tool-calling — so the OpenAI adapter
 * drives it directly with a dummy key (Ollama ignores it). Zero per-use cost.
 */
export function makeLlmClient(): LlmClient & { isAvailable(): boolean } {
  const provider = (process.env.FORGECAST_AGENT_LLM ?? '').trim().toLowerCase();
  if (provider === 'anthropic' || provider === 'claude') return new AnthropicLlmClient();
  if (provider === 'ollama' || provider === 'local') {
    const host = (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
    return new OpenAiLlmClient({
      baseUrl: `${host}/v1`,
      // Ollama ignores the key, but a non-empty value keeps isAvailable() true so
      // the agent is offered (it's a free local model — nothing to bill).
      apiKey: process.env.OLLAMA_API_KEY ?? 'ollama',
      model: process.env.OLLAMA_MODEL ?? 'llama3.1',
    });
  }
  return new OpenAiLlmClient();
}
