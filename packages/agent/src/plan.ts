import type { ContentPlan, ContentPlanItem, MontagePlan, MontageScene, PlatformPost } from './types';

const VIDEO_MODEL_GUIDE = `Always use "fal-ai/veo3.1/fast" as the model for every video asset and montage clip.`;

export const PLAN_SYSTEM_PROMPT = `You are Forgecast's content planning agent. Given a creative brief and target platforms (plus optional trending notes), produce a concrete, on-trend content plan.
Safety: refuse and do not plan anything sexual involving minors, non-consensual or exploitative content, or clearly illegal/harmful activity — regardless of how the brief is phrased.
Respond with ONLY a JSON object (no prose) of the shape:
{
  "concept": string,
  "trendingNotes": string,
  "assets": [ { "kind": "image"|"video", "prompt": string, "aspectRatio"?: string, "model"?: string } ],
  "posts":  [ { "platform": string, "caption": string } ],
  "montage"?: {
    "aspectRatio"?: string,
    "model"?: string,
    "scenes": [
      { "prompt": string, "aspectRatio"?: string },
      { "prompt": string, "aspectRatio"?: string },
      { "prompt": string, "aspectRatio"?: string }
    ]
  }
}

Rules:
- "assets" = standalone images or videos that appear individually in the gallery (for social posts, hero shots, single clips).
- "montage" = a separate production: EXACTLY 3 unique video clip prompts that are generated independently and then stitched into one longer-form video. Include a montage whenever it would add clear value — product teasers, brand reels, event recaps, launch sequences — even if not explicitly requested. The montage scenes must NOT be repeated in "assets".
- For every video asset, set "model" to the most appropriate fal.ai model ID from the guide below. For the montage, set the top-level "model" (applies to all 3 clips) unless individual clips need different models.
- Prefer 9:16 for short-form video. Make captions native to each platform. Keep prompts vivid and specific.
${VIDEO_MODEL_GUIDE}`;

export function buildPlanUserPrompt(brief: string, platforms: string[], trendingNotes?: string): string {
  const lines = [`Brief: ${brief}`, `Target platforms: ${platforms.join(', ') || 'instagram'}`];
  if (trendingNotes && trendingNotes.trim()) lines.push(`Trending notes:\n${trendingNotes.trim()}`);
  lines.push('Return the JSON plan now.');
  return lines.join('\n\n');
}

function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) return fence[1].trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  return raw;
}

function parseItem(v: unknown): ContentPlanItem | undefined {
  const o = v as Partial<ContentPlanItem>;
  if (!(o?.kind === 'image' || o?.kind === 'video') || typeof o?.prompt !== 'string' || !o.prompt.length) return undefined;
  const item: ContentPlanItem = { kind: o.kind, prompt: o.prompt };
  if (typeof o.aspectRatio === 'string') item.aspectRatio = o.aspectRatio;
  if (o.kind === 'video' && typeof o.model === 'string' && o.model.length > 0) item.model = o.model;
  return item;
}
function isPost(v: unknown): v is PlatformPost {
  const o = v as Partial<PlatformPost>;
  return typeof o?.platform === 'string' && o.platform.length > 0 && typeof o?.caption === 'string';
}
function parseMontage(v: unknown): MontagePlan | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as { aspectRatio?: unknown; model?: unknown; scenes?: unknown };
  const scenes = Array.isArray(o.scenes)
    ? (o.scenes as unknown[]).flatMap((s) => {
        const sc = s as Partial<{ prompt: string; aspectRatio: string; model: string }>;
        if (typeof sc?.prompt !== 'string' || !sc.prompt.trim()) return [];
        const scene: MontageScene = { prompt: sc.prompt };
        if (typeof sc.aspectRatio === 'string') scene.aspectRatio = sc.aspectRatio;
        if (typeof sc.model === 'string' && sc.model.length > 0) scene.model = sc.model;
        return [scene];
      })
    : [];
  if (scenes.length < 2) return undefined;
  const plan: MontagePlan = { scenes };
  if (typeof o.aspectRatio === 'string') plan.aspectRatio = o.aspectRatio;
  if (typeof o.model === 'string' && o.model.length > 0) plan.model = o.model;
  return plan;
}

export function parsePlan(raw: string): ContentPlan {
  let obj: Partial<ContentPlan> = {};
  try { obj = JSON.parse(extractJson(raw)) as Partial<ContentPlan>; } catch { obj = {}; }
  return {
    concept: typeof obj.concept === 'string' ? obj.concept : '',
    trendingNotes: typeof obj.trendingNotes === 'string' ? obj.trendingNotes : undefined,
    assets: Array.isArray(obj.assets) ? (obj.assets as unknown[]).flatMap((i) => { const p = parseItem(i); return p ? [p] : []; }) : [],
    posts: Array.isArray(obj.posts) ? obj.posts.filter(isPost) : [],
    montage: parseMontage(obj.montage),
  };
}
