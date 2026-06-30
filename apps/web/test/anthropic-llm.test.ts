import { describe, it, expect, afterEach, vi } from 'vitest';
import { AnthropicLlmClient, OpenAiLlmClient, makeLlmClient } from '../lib/agent/llm';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const savedEnv = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  FORGECAST_AGENT_LLM: process.env.FORGECAST_AGENT_LLM,
  OLLAMA_URL: process.env.OLLAMA_URL,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
};
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('AnthropicLlmClient', () => {
  it('isAvailable reflects the key', () => {
    expect(new AnthropicLlmClient({ apiKey: undefined }).isAvailable()).toBe(false);
    expect(new AnthropicLlmClient({ apiKey: 'k' }).isAvailable()).toBe(true);
  });

  it('complete() hits the Messages API with x-api-key + version and parses text', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ content: [{ type: 'text', text: 'hello from claude' }] }));
    const llm = new AnthropicLlmClient({ apiKey: 'k', fetchFn });
    expect(await llm.complete({ system: 's', user: 'u' })).toBe('hello from claude');

    const [url, init] = fetchFn.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('k');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('claude-opus-4-8');
    expect(sent.system).toBe('s');
    expect(sent.messages).toEqual([{ role: 'user', content: 'u' }]);
    // Opus 4.8 rejects sampling params — none must be sent.
    expect(sent.temperature).toBeUndefined();
    expect(sent.top_p).toBeUndefined();
  });

  it('chat() maps tools→input_schema, system→top-level, tool msgs→tool_result, and parses tool_use', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({
        content: [
          { type: 'text', text: 'on it' },
          { type: 'tool_use', id: 'tu_1', name: 'generate_image', input: { prompt: 'a fox' } },
        ],
      }),
    );
    const llm = new AnthropicLlmClient({ apiKey: 'k', fetchFn });

    const out = await llm.chat({
      tools: [{ name: 'generate_image', description: 'make an image', parameters: { type: 'object', properties: { prompt: { type: 'string' } } } }],
      messages: [
        { role: 'system', content: 'you are an agent' },
        { role: 'user', content: 'make a fox image' },
        { role: 'assistant', content: 'sure', toolCalls: [{ id: 'tu_0', name: 'generate_image', argumentsJson: '{"prompt":"fox"}' }] },
        { role: 'tool', toolCallId: 'tu_0', content: 'image asset a1 created' },
      ],
    });

    // Parsed response
    expect(out.content).toBe('on it');
    expect(out.toolCalls).toEqual([{ id: 'tu_1', name: 'generate_image', argumentsJson: '{"prompt":"a fox"}' }]);

    // Request shaping
    const sent = JSON.parse((fetchFn.mock.calls[0]![1]!).body as string);
    expect(sent.system).toBe('you are an agent');
    expect(sent.tools).toEqual([{ name: 'generate_image', description: 'make an image', input_schema: { type: 'object', properties: { prompt: { type: 'string' } } } }]);
    // system stripped from messages; first message is the user turn
    expect(sent.messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: 'make a fox image' }] });
    // assistant turn carries a text block + a tool_use block
    expect(sent.messages[1].role).toBe('assistant');
    expect(sent.messages[1].content).toEqual([
      { type: 'text', text: 'sure' },
      { type: 'tool_use', id: 'tu_0', name: 'generate_image', input: { prompt: 'fox' } },
    ]);
    // tool result becomes a tool_result block inside a user message
    expect(sent.messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_0', content: 'image asset a1 created' }] });
    expect(sent.temperature).toBeUndefined();
  });
});

describe('makeLlmClient', () => {
  it('defaults to OpenAI — even when ANTHROPIC_API_KEY is present in the env', () => {
    delete process.env.FORGECAST_AGENT_LLM;
    process.env.ANTHROPIC_API_KEY = 'ambient-key';
    expect(makeLlmClient()).toBeInstanceOf(OpenAiLlmClient);
  });

  it('uses Claude only when explicitly opted in via FORGECAST_AGENT_LLM', () => {
    process.env.FORGECAST_AGENT_LLM = 'anthropic';
    expect(makeLlmClient()).toBeInstanceOf(AnthropicLlmClient);
    process.env.FORGECAST_AGENT_LLM = 'claude';
    expect(makeLlmClient()).toBeInstanceOf(AnthropicLlmClient);
  });

  it('runs on a free local Ollama model when opted in (FORGECAST_AGENT_LLM=ollama)', async () => {
    const fetchSpy = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ choices: [{ message: { content: 'local hi' } }] }));
    vi.stubGlobal('fetch', fetchSpy); // client captures fetch at construction → stub first
    try {
      process.env.FORGECAST_AGENT_LLM = 'ollama';
      process.env.OLLAMA_URL = 'http://localhost:11434';
      process.env.OLLAMA_MODEL = 'qwen2.5';
      delete process.env.OPENAI_API_KEY; // no cloud key required

      const llm = makeLlmClient();
      expect(llm).toBeInstanceOf(OpenAiLlmClient);
      expect(llm.isAvailable()).toBe(true); // free local → always "available", nothing to bill

      expect(await llm.complete({ system: 's', user: 'u' })).toBe('local hi');
      const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
      expect(url).toBe('http://localhost:11434/v1/chat/completions'); // Ollama's OpenAI-compatible endpoint
      expect(JSON.parse(init.body as string).model).toBe('qwen2.5');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
