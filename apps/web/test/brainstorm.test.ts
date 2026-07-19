import { describe, it, expect, vi } from 'vitest';
import type { ImageProvider } from '@forgecast/core';
import { buildServices } from '../lib/forgecast';
import {
  createProject,
  listBrainstormBoards,
  saveBrainstormBoard,
  deleteBrainstormBoard,
  generateBrainstormIdea,
} from '../lib/api';
import { handleMcpMessage } from '../lib/mcp';

function makeServices() {
  const fetchFn = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;
  const svc = buildServices({ falKey: 'k', fetchFn });
  const provider: ImageProvider = {
    name: 'fal',
    isAvailable: () => true,
    async generateImage() { return { url: 'data:image/png;base64,QUJD' }; },
  };
  svc.imageRegistry.register(provider);
  return svc;
}

async function newProjectId(svc: ReturnType<typeof buildServices>, owner?: string): Promise<string> {
  const pc = await createProject(svc, { name: 'Brainstorm Test' }, owner);
  return (pc.body as { project: { id: string } }).project.id;
}

const PLAN = {
  concept: 'Recycled sneaker launch',
  trendingNotes: 'quiet-luxury outdoors is trending',
  assets: [
    { kind: 'image', prompt: 'hero sneaker on mossy rock', aspectRatio: '4:5' },
    { kind: 'video', prompt: 'slow pan across the sole' },
  ],
  posts: [{ platform: 'instagram', caption: 'Step lightly.' }],
  montage: { model: 'fal-ai/veo3.1/fast', scenes: [{ prompt: 'clip one' }, { prompt: 'clip two' }] },
};

describe('brainstorm boards — persistence + upsert', () => {
  it('saves a board from a plan (assets + montage → ideas, posts → captions) and lists it', async () => {
    const svc = makeServices();
    const pid = await newProjectId(svc);

    const saved = await saveBrainstormBoard(svc, pid, { plan: PLAN, brief: 'launch it', platforms: ['instagram'] });
    expect(saved.status).toBe(200);
    const board = (saved.body as { board: { id: string; ideas: Array<{ kind: string; prompt: string }>; captions: unknown[]; concept: string } }).board;
    expect(board.concept).toBe('Recycled sneaker launch');
    // 2 assets + 2 montage scenes = 4 ideas.
    expect(board.ideas).toHaveLength(4);
    expect(board.ideas.filter((i) => i.kind === 'video')).toHaveLength(3);
    expect(board.captions).toHaveLength(1);

    const list = await listBrainstormBoards(svc, pid);
    expect(list.status).toBe(200);
    expect((list.body as { count: number }).count).toBe(1);
  });

  it('upserts by id in place (preserving createdAt) instead of duplicating', async () => {
    const svc = makeServices();
    const pid = await newProjectId(svc);
    const first = await saveBrainstormBoard(svc, pid, { board: { concept: 'v1', ideas: [{ prompt: 'a' }] } });
    const board = (first.body as { board: { id: string; createdAt: string } }).board;

    const updated = await saveBrainstormBoard(svc, pid, { board: { id: board.id, concept: 'v2', ideas: [{ prompt: 'a' }, { prompt: 'b' }] } });
    const u = (updated.body as { board: { id: string; concept: string; createdAt: string; ideas: unknown[] } }).board;
    expect(u.id).toBe(board.id);
    expect(u.concept).toBe('v2');
    expect(u.createdAt).toBe(board.createdAt); // creation time preserved on update
    expect(u.ideas).toHaveLength(2);

    const list = await listBrainstormBoards(svc, pid);
    expect((list.body as { count: number }).count).toBe(1); // no duplicate
  });

  it('deletes a board and 404s an unknown board / project', async () => {
    const svc = makeServices();
    const pid = await newProjectId(svc);
    const saved = await saveBrainstormBoard(svc, pid, { board: { concept: 'c', ideas: [{ prompt: 'a' }] } });
    const id = (saved.body as { board: { id: string } }).board.id;

    expect((await deleteBrainstormBoard(svc, pid, 'nope')).status).toBe(404);
    expect((await deleteBrainstormBoard(svc, pid, id)).status).toBe(200);
    expect((await listBrainstormBoards(svc, pid)).body).toMatchObject({ count: 0 });

    expect((await listBrainstormBoards(svc, 'no-such-project')).status).toBe(404);
    expect((await saveBrainstormBoard(svc, 'no-such-project', { board: { ideas: [] } })).status).toBe(404);
  });

  it('content-guards idea prompts before persisting', async () => {
    const svc = makeServices();
    const pid = await newProjectId(svc);
    const r = await saveBrainstormBoard(svc, pid, { board: { concept: 'c', ideas: [{ prompt: 'sexual content involving a minor' }] } });
    expect(r.status).toBe(400);
    expect((await listBrainstormBoards(svc, pid)).body).toMatchObject({ count: 0 });
  });
});

describe('brainstorm boards — forge an idea', () => {
  it('generates an image idea synchronously and stamps the assetId onto the board', async () => {
    const svc = makeServices();
    const pid = await newProjectId(svc);
    const saved = await saveBrainstormBoard(svc, pid, { board: { concept: 'c', ideas: [{ kind: 'image', prompt: 'a glowing anvil' }] } });
    const board = (saved.body as { board: { id: string; ideas: Array<{ id: string }> } }).board;

    const gen = await generateBrainstormIdea(svc, pid, board.id, board.ideas[0]!.id);
    expect(gen.status).toBe(200);
    const updated = (gen.body as { board: { ideas: Array<{ assetId?: string }> }; asset: { id: string } }).board;
    expect(updated.ideas[0]!.assetId).toBeTruthy();

    // Persisted: re-listing shows the stamped assetId.
    const list = await listBrainstormBoards(svc, pid);
    const persisted = (list.body as { boards: Array<{ ideas: Array<{ assetId?: string }> }> }).boards[0]!;
    expect(persisted.ideas[0]!.assetId).toBe(updated.ideas[0]!.assetId);
  });

  it('404s a missing board or idea', async () => {
    const svc = makeServices();
    const pid = await newProjectId(svc);
    const saved = await saveBrainstormBoard(svc, pid, { board: { concept: 'c', ideas: [{ prompt: 'a' }] } });
    const board = (saved.body as { board: { id: string } }).board;
    expect((await generateBrainstormIdea(svc, pid, 'nope', 'x')).status).toBe(404);
    expect((await generateBrainstormIdea(svc, pid, board.id, 'nope')).status).toBe(404);
  });
});

describe('brainstorm boards — MCP', () => {
  function textOf(reply: Awaited<ReturnType<typeof handleMcpMessage>>): string {
    const body = reply!.body as { result?: { content?: Array<{ text?: string }> } };
    return body.result?.content?.[0]?.text ?? '';
  }

  it('exposes list/save/generate tools and round-trips a board', async () => {
    const svc = makeServices();
    const pid = await newProjectId(svc);
    const ctx = { services: svc, userId: 'local' as string };

    const tools = await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const names = ((tools!.body as { result: { tools: Array<{ name: string }> } }).result.tools).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      'forgecast_list_brainstorm', 'forgecast_save_brainstorm', 'forgecast_generate_brainstorm_idea',
    ]));

    const save = await handleMcpMessage(ctx, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'forgecast_save_brainstorm', arguments: { projectId: pid, board: { concept: 'mcp concept', ideas: [{ kind: 'image', prompt: 'x' }] } } },
    });
    const savedBoard = JSON.parse(textOf(save)) as { board: { id: string } };
    expect(savedBoard.board.id).toBeTruthy();

    const list = await handleMcpMessage(ctx, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'forgecast_list_brainstorm', arguments: { projectId: pid } },
    });
    const listed = JSON.parse(textOf(list)) as { count: number };
    expect(listed.count).toBe(1);
  });
});
