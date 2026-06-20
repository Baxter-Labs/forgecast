import type { ContentPlan, ContentPlanItem, PlatformPost } from './types';

export const PLAN_SYSTEM_PROMPT = `You are Forgecast's content planning agent. Given a creative brief and target platforms (plus optional trending notes), produce a concrete, on-trend content plan.
Respond with ONLY a JSON object (no prose) of the shape:
{
  "concept": string,                       // the core creative idea, one sentence
  "trendingNotes": string,                 // how you applied current trends
  "assets": [ { "kind": "image"|"video", "prompt": string, "aspectRatio"?: string } ],
  "posts":  [ { "platform": string, "caption": string } ]   // one per target platform, tuned to it
}
Keep prompts vivid and specific. Prefer 9:16 for short-form video. Make captions native to each platform.`;

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

export function parsePlan(raw: string): ContentPlan {
  let obj: Partial<ContentPlan> = {};
  try { obj = JSON.parse(extractJson(raw)) as Partial<ContentPlan>; } catch { obj = {}; }
  return {
    concept: typeof obj.concept === 'string' ? obj.concept : '',
    trendingNotes: typeof obj.trendingNotes === 'string' ? obj.trendingNotes : undefined,
    assets: Array.isArray(obj.assets) ? obj.assets.filter(isItem) : [],
    posts: Array.isArray(obj.posts) ? obj.posts.filter(isPost) : [],
  };
}
