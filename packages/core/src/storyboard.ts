import { brandKitToPrompt, isEmptyBrandKit, type BrandKit } from './brandkit';

/**
 * Storyboard / Director — the LTX-Studio / OpenArt-Director-class flow: a brief
 * becomes an LLM-planned shot list, each shot renders an identity-consistent
 * still (starring the user's saved characters), shots can be animated
 * (image-to-video), and the board assembles onto the editor timeline (captions +
 * camera presets + voice-over) for rendering.
 *
 * Deliberately vendor- and UI-neutral (mirrors editor.ts): the SAME storyboard
 * can be directed by a human in the Studio *or* by an agent over MCP. Pure
 * functions here (normalize / prompt-build / parse) so planning is
 * unit-testable without an LLM; the web layer wires them to the agent LLM.
 */

export type StoryboardShotType = 'wide' | 'medium' | 'close-up' | 'establishing' | 'detail' | 'pov';

export const STORYBOARD_SHOT_TYPES: readonly StoryboardShotType[] = [
  'wide', 'medium', 'close-up', 'establishing', 'detail', 'pov',
];

/** Hard cap on shots per storyboard (keeps render fan-out serverless-friendly). */
export const MAX_STORYBOARD_SHOTS = 12;

export interface StoryboardShot {
  /** Stable id within the storyboard. */
  id: string;
  /** What the frame shows — a self-contained visual description for the image model. */
  prompt: string;
  /** Optional on-screen caption carried onto the timeline clip. */
  caption?: string;
  /** Cinematic framing, folded into the render prompt. */
  shotType?: StoryboardShotType;
  /** Free-text camera direction ("low angle, slow push-in"), folded into the prompt. */
  cameraAngle?: string;
  /** Cast member starring in this shot — identity holds via their references. */
  characterId?: string;
  /** Seconds this shot plays on the assembled timeline. */
  durationSec: number;
  /** The rendered still frame (set by render-shot). */
  imageAssetId?: string;
  /** The animated clip (set once an animate job completes); preferred over the still. */
  clipAssetId?: string;
}

export interface Storyboard {
  title: string;
  brief: string;
  /** Output shape — `9:16` (default), `16:9`, `1:1`, `4:5`, `4:3`, `3:4`. */
  aspectRatio: string;
  shots: StoryboardShot[];
  /** Optional narration script, synthesized to a voice-over at assemble time. */
  voiceoverScript?: string;
}

const ASPECTS = new Set(['9:16', '16:9', '1:1', '4:5', '4:3', '3:4']);
const SHOT_TYPES = new Set<StoryboardShotType>(STORYBOARD_SHOT_TYPES);

function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

/** An empty storyboard (default vertical). */
export function emptyStoryboard(aspectRatio = '9:16'): Storyboard {
  return { title: '', brief: '', aspectRatio: ASPECTS.has(aspectRatio) ? aspectRatio : '9:16', shots: [] };
}

/**
 * Validate + clamp an untrusted storyboard (from the UI, the LLM planner, or an
 * agent) into a clean `Storyboard`. Invalid shots (no prompt) are dropped; ids
 * are backfilled with `genId`; durations clamped to 1–15s; shotType
 * whitelisted; shots capped at MAX_STORYBOARD_SHOTS.
 */
export function normalizeStoryboard(input: unknown, genId: () => string): Storyboard {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const aspectRatio = typeof o.aspectRatio === 'string' && ASPECTS.has(o.aspectRatio) ? o.aspectRatio : '9:16';

  const shots: StoryboardShot[] = [];
  const rawShots = Array.isArray(o.shots) ? o.shots : [];
  for (const s of rawShots) {
    if (shots.length >= MAX_STORYBOARD_SHOTS) break;
    if (!s || typeof s !== 'object') continue;
    const ss = s as Record<string, unknown>;
    if (typeof ss.prompt !== 'string' || ss.prompt.trim().length === 0) continue;
    const shot: StoryboardShot = {
      id: typeof ss.id === 'string' && ss.id.length > 0 ? ss.id : genId(),
      prompt: ss.prompt.trim(),
      durationSec: clamp(typeof ss.durationSec === 'number' && Number.isFinite(ss.durationSec) ? ss.durationSec : 4, 1, 15),
    };
    if (typeof ss.caption === 'string' && ss.caption.trim().length > 0) shot.caption = ss.caption.trim();
    if (typeof ss.shotType === 'string' && SHOT_TYPES.has(ss.shotType as StoryboardShotType)) shot.shotType = ss.shotType as StoryboardShotType;
    if (typeof ss.cameraAngle === 'string' && ss.cameraAngle.trim().length > 0) shot.cameraAngle = ss.cameraAngle.trim();
    if (typeof ss.characterId === 'string' && ss.characterId.length > 0) shot.characterId = ss.characterId;
    if (typeof ss.imageAssetId === 'string' && ss.imageAssetId.length > 0) shot.imageAssetId = ss.imageAssetId;
    if (typeof ss.clipAssetId === 'string' && ss.clipAssetId.length > 0) shot.clipAssetId = ss.clipAssetId;
    shots.push(shot);
  }

  const storyboard: Storyboard = {
    title: typeof o.title === 'string' ? o.title.trim().slice(0, 120) : '',
    brief: typeof o.brief === 'string' ? o.brief.trim() : '',
    aspectRatio,
    shots,
  };
  if (typeof o.voiceoverScript === 'string' && o.voiceoverScript.trim().length > 0) {
    storyboard.voiceoverScript = o.voiceoverScript.trim();
  }
  return storyboard;
}

/** A shot's full render prompt: the visual description with shotType/cameraAngle folded in. */
export function storyboardShotPrompt(shot: Pick<StoryboardShot, 'prompt' | 'shotType' | 'cameraAngle'>): string {
  const parts = [shot.prompt];
  if (shot.shotType) parts.push(`${shot.shotType} shot`);
  if (shot.cameraAngle) parts.push(`camera: ${shot.cameraAngle}`);
  return parts.length > 1 ? `${parts[0]} — ${parts.slice(1).join(', ')}` : parts[0]!;
}

/** Build the system+user prompt that asks the LLM to plan the shot list. */
export function buildStoryboardPrompt(input: {
  brief: string;
  shotCount: number;
  aspectRatio: string;
  brandKit?: BrandKit | null;
  characterName?: string;
}): { system: string; user: string } {
  const brand = isEmptyBrandKit(input.brandKit) ? '' : brandKitToPrompt(input.brandKit as BrandKit);
  const system = [
    'You are a professional film director and storyboard artist planning a short-form video.',
    `Break the brief into exactly ${input.shotCount} shots for a ${input.aspectRatio} video.`,
    'Each shot needs: "prompt" (a vivid, self-contained visual description a text-to-image model can render — subject, setting, lighting, mood), an optional short on-screen "caption" (under 60 characters), a "shotType" (one of: wide, medium, close-up, establishing, detail, pov) and "durationSec" (a number of seconds, 2–8).',
    'Vary shot types cinematically (establishing → coverage → detail) and keep visual continuity across shots.',
    input.characterName ? `The star of every shot is ${input.characterName} — write each prompt around them.` : '',
    brand ? `Brand: ${brand}` : '',
    'Also write "voiceoverScript": a short spoken narration (2–4 sentences) that covers the whole video, and a short "title".',
    'Respond with ONLY a JSON object of the shape { "title": string, "voiceoverScript": string, "shots": [ { "prompt": string, "caption": string, "shotType": string, "durationSec": number } ] }. No markdown fences, no commentary.',
  ]
    .filter(Boolean)
    .join('\n');
  const user = `Brief: ${input.brief}\n\nReturn the JSON object with ${input.shotCount} shots now.`;
  return { system, user };
}

/** Pull the first JSON container out of a model response that may be fenced or wrapped in prose. */
function extractJson(raw: string): unknown | null {
  const objStart = raw.indexOf('{');
  const arrStart = raw.indexOf('[');
  const tryObject = (): unknown | null => {
    const end = raw.lastIndexOf('}');
    if (objStart === -1 || end <= objStart) return null;
    try { return JSON.parse(raw.slice(objStart, end + 1)); } catch { return null; }
  };
  const tryArray = (): unknown | null => {
    const end = raw.lastIndexOf(']');
    if (arrStart === -1 || end <= arrStart) return null;
    try { return JSON.parse(raw.slice(arrStart, end + 1)); } catch { return null; }
  };
  // Prefer whichever container opens first (a bare array of shots starts '[', so
  // its first '{' — shot one — must not swallow the parse).
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) return tryArray() ?? tryObject();
  return tryObject() ?? tryArray();
}

/**
 * Parse an LLM planning response defensively (like parseAdCopyVariants): accepts
 * the documented object shape, a bare array of shots, fenced/prose-wrapped JSON.
 * Returns raw (un-normalized) shots — run the result through normalizeStoryboard.
 */
export function parseStoryboardPlan(raw: string): { title?: string; voiceoverScript?: string; shots: unknown[] } {
  const parsed = extractJson(raw);
  if (Array.isArray(parsed)) return { shots: parsed };
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>;
    return {
      ...(typeof o.title === 'string' && o.title.trim().length > 0 ? { title: o.title.trim() } : {}),
      ...(typeof o.voiceoverScript === 'string' && o.voiceoverScript.trim().length > 0 ? { voiceoverScript: o.voiceoverScript.trim() } : {}),
      shots: Array.isArray(o.shots) ? o.shots : [],
    };
  }
  return { shots: [] };
}
