import { describe, it, expect, vi } from 'vitest';
import type { LlmClient, TrendTool, ForgecastActions, ContentPlan } from '../src/index';
import { ContentAgent } from '../src/index';

const samplePlan: ContentPlan = {
  concept: 'Eco sneaker teaser',
  assets: [
    { kind: 'video', prompt: 'sneaker from leaves', aspectRatio: '9:16' },
    { kind: 'image', prompt: 'hero shot' },
  ],
  posts: [{ platform: 'instagram', caption: 'Drop 🌱' }, { platform: 'linkedin', caption: 'Reimagined.' }],
};

describe('ContentAgent.plan', () => {
  it('gathers trends per platform and returns a parsed plan', async () => {
    const llm: LlmClient = { complete: vi.fn(async () => '```json\n' + JSON.stringify(samplePlan) + '\n```') };
    const trends: TrendTool = { trending: vi.fn(async (_t, p) => `trend for ${p}`) };
    const forgecast = {} as ForgecastActions;
    const agent = new ContentAgent({ llm, trends, forgecast });

    const plan = await agent.plan('eco sneaker launch', ['instagram', 'linkedin']);
    expect(plan.concept).toBe('Eco sneaker teaser');
    expect((trends.trending as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    // trending notes were passed into the llm user prompt
    const firstCall = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [{ system: string; user: string }];
    const userArg = firstCall[0].user;
    expect(userArg).toContain('trend for instagram');
  });

  it('works without a trend tool', async () => {
    const llm: LlmClient = { complete: vi.fn(async () => JSON.stringify(samplePlan)) };
    const agent = new ContentAgent({ llm, forgecast: {} as ForgecastActions });
    expect((await agent.plan('x', ['instagram'])).assets).toHaveLength(2);
  });
});

describe('ContentAgent.execute', () => {
  it('creates a project, generates assets, and publishes', async () => {
    const llm = { complete: vi.fn() } as unknown as LlmClient;
    const forgecast: ForgecastActions = {
      ensureProject: vi.fn(async () => 'p1'),
      generateImage: vi.fn(async () => ({ assetId: 'a-img' })),
      generateVideo: vi.fn(async () => ({ jobId: 'j-vid' })),
      generateMontage: vi.fn(async () => ({ jobId: 'j-mtg' })),
      publish: vi.fn(async () => ({ postId: 'post1', status: 'publishing' })),
    };
    const agent = new ContentAgent({ llm, forgecast });

    const result = await agent.execute(samplePlan, { publish: true });
    expect(result.projectId).toBe('p1');
    expect(result.assetIds).toEqual(['a-img']);
    expect(result.videoJobIds).toEqual(['j-vid']);
    expect(forgecast.generateVideo).toHaveBeenCalledWith('p1', 'sneaker from leaves', '9:16');
    expect(forgecast.publish).toHaveBeenCalledWith('a-img', 'Drop 🌱', ['instagram', 'linkedin']);
    expect(result.published).toEqual({ postId: 'post1', status: 'publishing' });
  });

  it('skips publish when publish=false or no assets', async () => {
    const forgecast: ForgecastActions = {
      ensureProject: vi.fn(async () => 'p1'),
      generateImage: vi.fn(async () => ({ assetId: null })),
      generateVideo: vi.fn(async () => ({ jobId: 'j' })),
      generateMontage: vi.fn(async () => ({ jobId: 'jm' })),
      publish: vi.fn(async () => ({ postId: 'x', status: 's' })),
    };
    const agent = new ContentAgent({ llm: { complete: vi.fn() } as unknown as LlmClient, forgecast });
    const r = await agent.execute({ concept: 'c', assets: [{ kind: 'image', prompt: 'p' }], posts: [{ platform: 'instagram', caption: 'hi' }] }, { publish: false });
    expect(r.published).toBeNull();
    expect(forgecast.publish).not.toHaveBeenCalled();
  });

  it('reuses an existing project (no new project) when projectId is provided', async () => {
    const forgecast: ForgecastActions = {
      ensureProject: vi.fn(async () => 'NEW-PROJECT'),
      generateImage: vi.fn(async () => ({ assetId: 'a-img' })),
      generateVideo: vi.fn(async () => ({ jobId: 'j-vid' })),
      generateMontage: vi.fn(async () => ({ jobId: 'j-mtg' })),
      publish: vi.fn(async () => ({ postId: 'p', status: 's' })),
    };
    const plan: ContentPlan = { concept: 'c', assets: [{ kind: 'image', prompt: 'a' }], posts: [] };
    const r = await new ContentAgent({ llm: { complete: vi.fn() } as unknown as LlmClient, forgecast }).execute(plan, { projectId: 'EXISTING' });
    expect(forgecast.ensureProject).not.toHaveBeenCalled();
    expect(forgecast.generateImage).toHaveBeenCalledWith('EXISTING', 'a', undefined);
    expect(r.projectId).toBe('EXISTING');
  });

  it('skips montage when the plan has no montage directive', async () => {
    const forgecast: ForgecastActions = {
      ensureProject: vi.fn(async () => 'p1'),
      generateImage: vi.fn(async () => ({ assetId: 'a-img' })),
      generateVideo: vi.fn(async () => ({ jobId: 'j-vid' })),
      generateMontage: vi.fn(async () => ({ jobId: 'j-mtg' })),
      publish: vi.fn(async () => ({ postId: 'p', status: 's' })),
    };
    const r = await new ContentAgent({ llm: { complete: vi.fn() } as unknown as LlmClient, forgecast }).execute(samplePlan);
    expect(forgecast.generateMontage).not.toHaveBeenCalled();
    expect(r.montageJobId).toBeUndefined();
  });

  it('stitches the generated image assets into a montage when the plan requests one', async () => {
    const forgecast: ForgecastActions = {
      ensureProject: vi.fn(async () => 'p1'),
      generateImage: vi.fn(async () => ({ assetId: 'a-img' })),
      generateVideo: vi.fn(async () => ({ jobId: 'j-vid' })),
      generateMontage: vi.fn(async () => ({ jobId: 'j-mtg' })),
      publish: vi.fn(async () => ({ postId: 'p', status: 's' })),
    };
    const plan: ContentPlan = {
      concept: 'reel',
      assets: [{ kind: 'image', prompt: 'a' }, { kind: 'image', prompt: 'b' }],
      posts: [],
      montage: { aspectRatio: '9:16' },
    };
    const r = await new ContentAgent({ llm: { complete: vi.fn() } as unknown as LlmClient, forgecast }).execute(plan);
    expect(forgecast.generateMontage).toHaveBeenCalledWith('p1', ['a-img', 'a-img'], '9:16');
    expect(r.montageJobId).toBe('j-mtg');
  });

  it('skips montage when requested but no image assets were produced', async () => {
    const forgecast: ForgecastActions = {
      ensureProject: vi.fn(async () => 'p1'),
      generateImage: vi.fn(async () => ({ assetId: null })),
      generateVideo: vi.fn(async () => ({ jobId: 'j' })),
      generateMontage: vi.fn(async () => ({ jobId: 'j-mtg' })),
      publish: vi.fn(async () => ({ postId: 'p', status: 's' })),
    };
    const plan: ContentPlan = { concept: 'c', assets: [{ kind: 'image', prompt: 'a' }], posts: [], montage: {} };
    const r = await new ContentAgent({ llm: { complete: vi.fn() } as unknown as LlmClient, forgecast }).execute(plan);
    expect(forgecast.generateMontage).not.toHaveBeenCalled();
    expect(r.montageJobId).toBeUndefined();
  });
});
