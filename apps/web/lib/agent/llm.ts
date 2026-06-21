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
