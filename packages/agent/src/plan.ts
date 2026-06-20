import type { ContentPlan, ContentPlanItem, MontagePlan, PlatformPost } from './types';

export const PLAN_SYSTEM_PROMPT = `You are Forgecast's content planning agent. Given a creative brief and target platforms (plus optional trending notes), produce a concrete, on-trend content plan.
Respond with ONLY a JSON object (no prose) of the shape:
{
  "concept": string,
  "trendingNotes": string,
  "assets": [ { "kind": "image"|"video", "prompt": string, "aspectRatio"?: string } ],
  "posts":  [ { "platform": string, "caption": string } ],
  "montage"?: {
    "aspectRatio"?: string,
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
- Prefer 9:16 for short-form video. Make captions native to each platform. Keep prompts vivid and specific.`;

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

function isItem(v: unknown): v is ContentPlanItem {
  const o = v as Partial<ContentPlanItem>;
  return (o?.kind === 'image' || o?.kind === 'video') && typeof o?.prompt === 'string' && o.prompt.length > 0;
}
function isPost(v: unknown): v is PlatformPost {
  const o = v as Partial<PlatformPost>;
  return typeof o?.platform === 'string' && o.platform.length > 0 && typeof o?.caption === 'string';
}
function parseMontage(v: unknown): MontagePlan | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as { aspectRatio?: unknown; scenes?: unknown };
  const scenes = Array.isArray(o.scenes)
    ? (o.scenes as unknown[]).flatMap((s) => {
        const sc = s as Partial<{ prompt: string; aspectRatio: string }>;
        return typeof sc?.prompt === 'string' && sc.prompt.trim()
          ? [{ prompt: sc.prompt, ...(typeof sc.aspectRatio === 'string' ? { aspectRatio: sc.aspectRatio } : {}) }]
          : [];
      })
    : [];
  if (scenes.length < 2) return undefined;
  return { ...(typeof o.aspectRatio === 'string' ? { aspectRatio: o.aspectRatio } : {}), scenes };
}

export function parsePlan(raw: string): ContentPlan {
  let obj: Partial<ContentPlan> = {};
  try { obj = JSON.parse(extractJson(raw)) as Partial<ContentPlan>; } catch { obj = {}; }
  return {
    concept: typeof obj.concept === 'string' ? obj.concept : '',
    trendingNotes: typeof obj.trendingNotes === 'string' ? obj.trendingNotes : undefined,
    assets: Array.isArray(obj.assets) ? obj.assets.filter(isItem) : [],
    posts: Array.isArray(obj.posts) ? obj.posts.filter(isPost) : [],
    montage: parseMontage(obj.montage),
  };
}
