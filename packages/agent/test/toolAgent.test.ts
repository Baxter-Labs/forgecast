import { describe, it, expect, vi } from 'vitest';
import type { ForgecastActions, LlmClient, LlmToolCall } from '../src/index';
import { ToolCallingAgent } from '../src/index';

function makeForgecast(): ForgecastActions {
  return {
    ensureProject: vi.fn(async () => 'p1'),
    generateImage: vi.fn(async () => ({ assetId: 'img1' })),
    generateVideo: vi.fn(async () => ({ jobId: 'vid1' })),
    generatePresenter: vi.fn(async () => ({ jobId: 'pres1' })),
    publish: vi.fn(async () => ({ postId: 'post1', status: 'publishing' })),
    readWebsite: vi.fn(async () => ({ summary: '' })),
  };
}

function call(name: string, args: Record<string, unknown>, id = `c-${name}`): LlmToolCall {
  return { id, name, argumentsJson: JSON.stringify(args) };
}

describe('ToolCallingAgent.run', () => {
  it('drives a scripted tool-calling loop: image, b-roll, presenter, finish', async () => {
    const responses: { content: string; toolCalls: LlmToolCall[] }[] = [
      { content: '', toolCalls: [call('generate_image', { prompt: 'hero shot' })] },
      { content: '', toolCalls: [call('generate_broll_video', { prompt: 'product in motion', aspect_ratio: '9:16' })] },
      { content: '', toolCalls: [call('generate_presenter_video', { presenter_description: 'a friendly founder', script: 'Check this out.' })] },
      { content: '', toolCalls: [call('finish', { summary: 'done' })] },
    ];
    let n = 0;
    const llm: LlmClient = {
      complete: vi.fn(),
      chat: vi.fn(async () => responses[n++]!),
    };
    const forgecast = makeForgecast();
    const agent = new ToolCallingAgent({ llm, forgecast });

    const result = await agent.run('a product');

    expect(result.projectId).toBe('p1');
    expect(result.imageAssetIds).toEqual(['img1']);
    expect(result.videoJobIds).toEqual(['vid1']);
    expect(result.presenterJobIds).toEqual(['pres1']);
    expect(result.summary).toBe('done');
    expect(result.steps).toHaveLength(4);
    expect(result.steps.map((s) => s.tool)).toEqual([
      'generate_image',
      'generate_broll_video',
      'generate_presenter_video',
      'finish',
    ]);
    // Presenter dispatched via generatePresenter with the right shape.
    expect(forgecast.generatePresenter).toHaveBeenCalledWith('p1', { imagePrompt: 'a friendly founder', script: 'Check this out.' });
    expect(forgecast.generateVideo).toHaveBeenCalledWith('p1', 'product in motion', '9:16');
    expect(llm.chat).toHaveBeenCalledTimes(4);
  });

  it('ends with the assistant content as the summary when no tools are called', async () => {
    const llm: LlmClient = {
      complete: vi.fn(),
      chat: vi.fn(async () => ({ content: 'I have nothing to make.', toolCalls: [] })),
    };
    const forgecast = makeForgecast();
    const result = await new ToolCallingAgent({ llm, forgecast }).run('a product');

    expect(result.summary).toBe('I have nothing to make.');
    expect(result.steps).toHaveLength(0);
    expect(result.imageAssetIds).toEqual([]);
    expect(result.videoJobIds).toEqual([]);
    expect(result.presenterJobIds).toEqual([]);
    expect(forgecast.generateImage).not.toHaveBeenCalled();
    expect(forgecast.generateVideo).not.toHaveBeenCalled();
    expect(forgecast.generatePresenter).not.toHaveBeenCalled();
  });

  it('throws when the LLM client does not support tool calling', async () => {
    const llm: LlmClient = { complete: vi.fn() };
    const forgecast = makeForgecast();
    await expect(new ToolCallingAgent({ llm, forgecast }).run('a product')).rejects.toThrow(
      'this LLM client does not support tool calling',
    );
  });

  it('reuses an existing project when projectId is provided', async () => {
    const llm: LlmClient = {
      complete: vi.fn(),
      chat: vi.fn(async () => ({ content: 'ok', toolCalls: [] })),
    };
    const forgecast = makeForgecast();
    const result = await new ToolCallingAgent({ llm, forgecast }).run('a product', { projectId: 'EXISTING' });
    expect(forgecast.ensureProject).not.toHaveBeenCalled();
    expect(result.projectId).toBe('EXISTING');
  });

  it('calls readWebsite when the LLM emits a read_website tool call and records a step', async () => {
    const responses: { content: string; toolCalls: LlmToolCall[] }[] = [
      { content: '', toolCalls: [call('read_website', { url: 'https://acme.com' })] },
      { content: '', toolCalls: [call('finish', { summary: 'done' })] },
    ];
    let n = 0;
    const llm: LlmClient = {
      complete: vi.fn(),
      chat: vi.fn(async () => responses[n++]!),
    };
    const forgecast = makeForgecast();
    (forgecast.readWebsite as ReturnType<typeof vi.fn>).mockResolvedValue({ summary: 'ACME sells eco shoes' });

    const result = await new ToolCallingAgent({ llm, forgecast }).run('check out https://acme.com');

    expect(forgecast.readWebsite).toHaveBeenCalledWith('https://acme.com');
    const readStep = result.steps.find((s) => s.tool === 'read_website');
    expect(readStep).toBeDefined();
    expect(readStep!.summary).toBe('read https://acme.com');
    expect(result.summary).toBe('done');
  });
});
