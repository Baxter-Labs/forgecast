/**
 * Brainstorm boards — the OpenArt/LTX-Studio "idea board" surface: the agent's
 * content PLAN (concept + a set of image/video idea prompts + platform captions)
 * persisted as a revisitable board instead of a throwaway chat reply. A board is
 * project-scoped; each idea can later be picked and forged into a gallery asset
 * (its `assetId` is stamped back on so the board tracks what's been produced).
 *
 * Deliberately vendor- and UI-neutral (mirrors storyboard.ts / editor.ts): the
 * SAME board can be authored by a human in the Studio *or* by an agent over MCP.
 * Pure functions here (normalize) so persistence is unit-testable without an LLM;
 * the web layer wires the planning agent to produce the raw board.
 */

export type BrainstormIdeaKind = 'image' | 'video';

/** Hard cap on ideas per board (keeps a board legible + generation fan-out bounded). */
export const MAX_BRAINSTORM_IDEAS = 24;
/** Hard cap on captions per board. */
export const MAX_BRAINSTORM_CAPTIONS = 24;
/** Hard cap on boards kept per project (newest-first; oldest fall off). */
export const MAX_BRAINSTORM_BOARDS = 50;

export interface BrainstormIdea {
  /** Stable id within the board. */
  id: string;
  /** Whether this idea forges an image or a video. */
  kind: BrainstormIdeaKind;
  /** The generation prompt — a self-contained description for the model. */
  prompt: string;
  /** Output shape hint, folded into generation when picked. */
  aspectRatio?: string;
  /** Optional model override (mainly for video ideas). */
  model?: string;
  /** The forged asset, set once this idea has been generated into the gallery. */
  assetId?: string;
}

export interface BrainstormCaption {
  platform: string;
  caption: string;
}

export interface BrainstormBoard {
  /** Stable id within the project. */
  id: string;
  /** Short human title for the board. */
  title: string;
  /** The brief the board was planned from. */
  brief: string;
  /** Target platforms this board is aimed at. */
  platforms: string[];
  /** One-line creative concept. */
  concept: string;
  /** Optional on-trend context the planner surfaced. */
  trendingNotes?: string;
  /** The idea prompts — the heart of the board. */
  ideas: BrainstormIdea[];
  /** Ready-to-post platform captions. */
  captions: BrainstormCaption[];
  createdAt: string;
}

const IDEA_KINDS = new Set<BrainstormIdeaKind>(['image', 'video']);

function trimStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function normalizePlatforms(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of raw) {
    if (typeof p !== 'string') continue;
    const norm = p.trim().slice(0, 40);
    const key = norm.toLowerCase();
    if (norm.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeIdea(input: unknown, genId: () => string): BrainstormIdea | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const prompt = trimStr(o.prompt, 2000);
  if (prompt.length === 0) return null;
  const idea: BrainstormIdea = {
    id: typeof o.id === 'string' && o.id.length > 0 ? o.id : genId(),
    kind: typeof o.kind === 'string' && IDEA_KINDS.has(o.kind as BrainstormIdeaKind) ? (o.kind as BrainstormIdeaKind) : 'image',
    prompt,
  };
  const aspectRatio = trimStr(o.aspectRatio, 12);
  if (aspectRatio.length > 0) idea.aspectRatio = aspectRatio;
  const model = trimStr(o.model, 120);
  if (model.length > 0) idea.model = model;
  if (typeof o.assetId === 'string' && o.assetId.length > 0) idea.assetId = o.assetId;
  return idea;
}

function normalizeCaption(input: unknown): BrainstormCaption | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const platform = trimStr(o.platform, 40);
  const caption = trimStr(o.caption, 2000);
  if (platform.length === 0 || caption.length === 0) return null;
  return { platform, caption };
}

/**
 * Validate + clamp an untrusted board (from the UI, the LLM planner, or an agent)
 * into a clean `BrainstormBoard`. Ideas/captions with no content are dropped; ids
 * are backfilled with `genId`; kinds whitelisted; everything capped.
 */
export function normalizeBrainstormBoard(input: unknown, genId: () => string, nowIso: string): BrainstormBoard {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

  const ideas: BrainstormIdea[] = [];
  for (const raw of Array.isArray(o.ideas) ? o.ideas : []) {
    if (ideas.length >= MAX_BRAINSTORM_IDEAS) break;
    const idea = normalizeIdea(raw, genId);
    if (idea) ideas.push(idea);
  }

  const captions: BrainstormCaption[] = [];
  for (const raw of Array.isArray(o.captions) ? o.captions : []) {
    if (captions.length >= MAX_BRAINSTORM_CAPTIONS) break;
    const cap = normalizeCaption(raw);
    if (cap) captions.push(cap);
  }

  const concept = trimStr(o.concept, 2000);
  const brief = trimStr(o.brief, 2000);
  // Fall back to the concept, then the brief, so a board always has a label.
  const title = trimStr(o.title, 120) || concept.slice(0, 80) || brief.slice(0, 80);
  const createdAt = typeof o.createdAt === 'string' && o.createdAt.length > 0 ? o.createdAt : nowIso;

  const board: BrainstormBoard = {
    id: typeof o.id === 'string' && o.id.length > 0 ? o.id : genId(),
    title,
    brief,
    platforms: normalizePlatforms(o.platforms),
    concept,
    ideas,
    captions,
    createdAt,
  };
  const trendingNotes = trimStr(o.trendingNotes, 2000);
  if (trendingNotes.length > 0) board.trendingNotes = trendingNotes;
  return board;
}

/**
 * Normalize a whole board collection (accepts `{ boards: [...] }` or a bare
 * array). Boards are returned newest-first and capped at MAX_BRAINSTORM_BOARDS.
 */
export function normalizeBrainstormBoards(input: unknown, genId: () => string): BrainstormBoard[] {
  const raw = Array.isArray(input)
    ? input
    : input && typeof input === 'object' && Array.isArray((input as Record<string, unknown>).boards)
      ? ((input as Record<string, unknown>).boards as unknown[])
      : [];
  const boards = raw.map((b) => normalizeBrainstormBoard(b, genId, new Date(0).toISOString()));
  boards.sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
  return boards.slice(0, MAX_BRAINSTORM_BOARDS);
}
