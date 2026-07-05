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
    listAssets: vi.fn(async () => ({ assets: [] })),
    getTimeline: vi.fn(async () => ({ timeline: { aspectRatio: '9:16', clips: [] } })),
    setTimeline: vi.fn(async (_p: string, t: unknown) => ({ timeline: t })),
    renderTimeline: vi.fn(async () => ({ jobId: 'tl-render-1' })),
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

  it('drives EDITOR mode: list assets → arrange the timeline → render it', async () => {
    const arrangement = {
      aspectRatio: '9:16',
      clips: [
        { assetId: 'a1', durationSec: 3, caption: 'Forge it', transition: 'fade' },
        { assetId: 'a2', durationSec: 5 },
      ],
    };
    const responses: { content: string; toolCalls: LlmToolCall[] }[] = [
      { content: '', toolCalls: [call('list_assets', {})] },
      { content: '', toolCalls: [call('set_timeline', { timeline: arrangement })] },
      { content: '', toolCalls: [call('render_timeline', {})] },
      { content: '', toolCalls: [call('finish', { summary: 'cut a 8s teaser' })] },
    ];
    let n = 0;
    const llm: LlmClient = { complete: vi.fn(), chat: vi.fn(async () => responses[n++]!) };
    const forgecast = makeForgecast();
    (forgecast.listAssets as ReturnType<typeof vi.fn>).mockResolvedValue({
      assets: [
        { id: 'a1', type: 'image', description: 'hero shot' },
        { id: 'a2', type: 'video', description: 'product b-roll' },
      ],
    });

    const result = await new ToolCallingAgent({ llm, forgecast }).run('cut my clips into a teaser', { projectId: 'p9' });

    expect(forgecast.listAssets).toHaveBeenCalledWith('p9');
    expect(forgecast.setTimeline).toHaveBeenCalledWith('p9', arrangement);
    expect(forgecast.renderTimeline).toHaveBeenCalledWith('p9');
    // The timeline render job rides videoJobIds so all existing job-polling UIs pick it up.
    expect(result.videoJobIds).toEqual(['tl-render-1']);
    expect(result.steps.map((s) => s.tool)).toEqual(['list_assets', 'set_timeline', 'render_timeline', 'finish']);
    expect(result.steps[1]!.summary).toBe('arranged 2 clips');
    expect(result.summary).toBe('cut a 8s teaser');
    expect(forgecast.generateImage).not.toHaveBeenCalled();
    expect(forgecast.generateVideo).not.toHaveBeenCalled();
  });

  it('feeds a render failure back to the LLM instead of a job id', async () => {
    const responses: { content: string; toolCalls: LlmToolCall[] }[] = [
      { content: '', toolCalls: [call('render_timeline', {})] },
      { content: '', toolCalls: [call('finish', { summary: 'could not render' })] },
    ];
    let n = 0;
    const llm: LlmClient = { complete: vi.fn(), chat: vi.fn(async () => responses[n++]!) };
    const forgecast = makeForgecast();
    (forgecast.renderTimeline as ReturnType<typeof vi.fn>).mockResolvedValue({ jobId: '', error: 'timeline has no clips to render' });

    const result = await new ToolCallingAgent({ llm, forgecast }).run('render it', { projectId: 'p9' });

    expect(result.videoJobIds).toEqual([]);
    expect(result.steps[0]!.summary).toContain('render failed: timeline has no clips');
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
