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

const montagePlan: ContentPlan = {
  concept: 'reel',
  assets: [],
  posts: [],
  montage: {
    aspectRatio: '9:16',
    scenes: [
      { prompt: 'clip a', aspectRatio: '9:16' },
      { prompt: 'clip b', aspectRatio: '9:16' },
      { prompt: 'clip c', aspectRatio: '9:16' },
    ],
  },
};

function makeForgecast(): ForgecastActions {
  return {
    ensureProject: vi.fn(async () => 'p1'),
    generateImage: vi.fn(async () => ({ assetId: 'a-img' })),
    generateVideo: vi.fn(async () => ({ jobId: 'j-vid' })),
    generatePresenter: vi.fn(async () => ({ jobId: 'j-pres' })),
    publish: vi.fn(async () => ({ postId: 'post1', status: 'publishing' })),
    readWebsite: vi.fn(async () => ({ summary: '' })),
  };
}

describe('ContentAgent.plan', () => {
  it('gathers trends per platform and returns a parsed plan', async () => {
    const llm: LlmClient = { complete: vi.fn(async () => '```json\n' + JSON.stringify(samplePlan) + '\n```') };
    const trends: TrendTool = { trending: vi.fn(async (_t, p) => `trend for ${p}`) };
    const forgecast = {} as ForgecastActions;
    const agent = new ContentAgent({ llm, trends, forgecast });

    const plan = await agent.plan('eco sneaker launch', ['instagram', 'linkedin']);
    expect(plan.concept).toBe('Eco sneaker teaser');
    expect((trends.trending as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
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
    const forgecast = makeForgecast();
    const agent = new ContentAgent({ llm, forgecast });

    const result = await agent.execute(samplePlan, { publish: true });
    expect(result.projectId).toBe('p1');
    expect(result.assetIds).toEqual(['a-img']);
    expect(result.videoJobIds).toEqual(['j-vid']);
    expect(forgecast.generateVideo).toHaveBeenCalledWith('p1', 'sneaker from leaves', '9:16', undefined);
    expect(forgecast.publish).toHaveBeenCalledWith('a-img', 'Drop 🌱', ['instagram', 'linkedin']);
    expect(result.published).toEqual({ postId: 'post1', status: 'publishing' });
  });

  it('skips publish when publish=false or no assets', async () => {
    const forgecast = makeForgecast();
    (forgecast.generateImage as ReturnType<typeof vi.fn>).mockResolvedValue({ assetId: null });
    const agent = new ContentAgent({ llm: { complete: vi.fn() } as unknown as LlmClient, forgecast });
    const r = await agent.execute({ concept: 'c', assets: [{ kind: 'image', prompt: 'p' }], posts: [{ platform: 'instagram', caption: 'hi' }] }, { publish: false });
    expect(r.published).toBeNull();
    expect(forgecast.publish).not.toHaveBeenCalled();
  });

  it('reuses an existing project when projectId is provided', async () => {
    const forgecast = makeForgecast();
    const plan: ContentPlan = { concept: 'c', assets: [{ kind: 'image', prompt: 'a' }], posts: [] };
    const r = await new ContentAgent({ llm: { complete: vi.fn() } as unknown as LlmClient, forgecast }).execute(plan, { projectId: 'EXISTING' });
    expect(forgecast.ensureProject).not.toHaveBeenCalled();
    expect(forgecast.generateImage).toHaveBeenCalledWith('EXISTING', 'a', undefined);
    expect(r.projectId).toBe('EXISTING');
  });

  it('queues montage clip jobs separately when the plan includes a montage', async () => {
    const forgecast = makeForgecast();
    const r = await new ContentAgent({ llm: { complete: vi.fn() } as unknown as LlmClient, forgecast }).execute(montagePlan);
    // Montage clips are queued via generateVideo (3 times, once per scene)
    expect(forgecast.generateVideo).toHaveBeenCalledTimes(3);
    expect(forgecast.generateVideo).toHaveBeenCalledWith('p1', 'clip a', '9:16', undefined);
    expect(forgecast.generateVideo).toHaveBeenCalledWith('p1', 'clip b', '9:16', undefined);
    expect(forgecast.generateVideo).toHaveBeenCalledWith('p1', 'clip c', '9:16', undefined);
    // Job IDs end up in montageJobIds, not videoJobIds
    expect(r.montageJobIds).toHaveLength(3);
    expect(r.videoJobIds).toHaveLength(0);
    expect(r.pendingMontage).toEqual({ aspectRatio: '9:16' });
  });

  it('does not set pendingMontage when the plan has no montage', async () => {
    const forgecast = makeForgecast();
    const r = await new ContentAgent({ llm: { complete: vi.fn() } as unknown as LlmClient, forgecast }).execute(samplePlan);
    expect(r.pendingMontage).toBeUndefined();
    expect(r.montageJobIds ?? []).toHaveLength(0);
  });
});
