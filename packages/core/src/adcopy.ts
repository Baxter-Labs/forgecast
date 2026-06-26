import { brandKitToPrompt, isEmptyBrandKit, type BrandKit } from './brandkit';

/**
 * Ad-copy generation primitives — the create-side answer to NotFair-style RSA copy:
 * platform-aware, character-limited, multi-variant (A/B/C) ad copy you can drop
 * straight into a cross-post. Pure functions so the catalog, prompt shape and
 * parsing are unit-testable without an LLM; the web layer wires them to the agent
 * LLM and the project brand kit.
 */

/** One generated ad-copy variant, A/B-tagged and within the platform limit. */
export interface AdCopyVariant {
  /** A, B, C … for easy A/B labelling. */
  id: string;
  text: string;
  /** Character count (code points), so emoji count as one. */
  chars: number;
}

/** The copy contract for a publishing surface — its hard char limit and how to write for it. */
export interface PlatformCopySpec {
  platform: string;
  label: string;
  /** Maximum characters a single variant may use. */
  limit: number;
  guidance: string;
}

const SPECS: Record<string, PlatformCopySpec> = {
  instagram: {
    platform: 'instagram',
    label: 'Instagram',
    limit: 2200,
    guidance:
      'Lead with a scroll-stopping hook (only ~125 chars show before "more"). Casual, vivid, emoji-friendly. Close with one clear CTA, then 3–8 relevant hashtags.',
  },
  linkedin: {
    platform: 'linkedin',
    label: 'LinkedIn',
    limit: 3000,
    guidance:
      'Professional but human. The first ~140 chars are the preview — earn the click there. Insight-led, no fluff, one clear CTA. Hashtags optional and sparing.',
  },
  twitter: {
    platform: 'twitter',
    label: 'X / Twitter',
    limit: 280,
    guidance: 'One sharp idea, hook first. Punchy and concrete. At most 1–2 hashtags. No filler, no throat-clearing.',
  },
  facebook: {
    platform: 'facebook',
    label: 'Facebook',
    limit: 2200,
    guidance: 'Conversational. Lead with the benefit to the reader. One clear CTA. Light emoji is fine.',
  },
  tiktok: {
    platform: 'tiktok',
    label: 'TikTok',
    limit: 2200,
    guidance: 'Trend-aware and casual with a fast hook (~150 chars recommended). Emoji + a few hashtags. Sound like a person, not a brand.',
  },
  youtube: {
    platform: 'youtube',
    label: 'YouTube',
    limit: 5000,
    guidance: 'Compelling first two lines (they show above the fold). Describe the value, then a CTA and any links.',
  },
  google: {
    platform: 'google',
    label: 'Google Search (RSA)',
    limit: 90,
    guidance:
      'Responsive Search Ad style: a tight description of ≤90 chars. Lead with the benefit, work in a keyword and a CTA. No emoji, no exclamation spam, no ALL CAPS.',
  },
};

const GENERIC_LIMIT = 280;

/** Resolve a platform name (case-insensitive; `x` aliases to `twitter`) to its copy spec. */
export function platformCopySpec(platform: string): PlatformCopySpec {
  const raw = (platform ?? '').toLowerCase().trim();
  const key = raw === 'x' ? 'twitter' : raw;
  return (
    SPECS[key] ?? {
      platform: key || 'generic',
      label: platform || 'Generic',
      limit: GENERIC_LIMIT,
      guidance: 'Clear, benefit-led copy with one strong CTA. Keep it tight.',
    }
  );
}

/** Build the system+user prompt that asks the LLM for N on-brand, char-limited variants. */
export function buildAdCopyPrompt(input: {
  brief: string;
  spec: PlatformCopySpec;
  count: number;
  brandKit?: BrandKit | null;
}): { system: string; user: string } {
  const brand = isEmptyBrandKit(input.brandKit) ? '' : brandKitToPrompt(input.brandKit as BrandKit);
  const system = [
    'You are a senior direct-response ad copywriter.',
    `Write ${input.count} distinct, high-converting ad-copy variants for ${input.spec.label}.`,
    `HARD CONSTRAINT: each variant MUST be ${input.spec.limit} characters or fewer.`,
    input.spec.guidance,
    brand ? `Brand: ${brand}` : '',
    'Make the variants genuinely different angles (e.g. benefit-led, problem→solution, social-proof). No numbering, no preamble.',
    'Respond with ONLY a JSON array of strings — one string per variant. No keys, no markdown fences, no commentary.',
  ]
    .filter(Boolean)
    .join('\n');
  const user = `Brief: ${input.brief}\n\nReturn the JSON array of ${input.count} variants now.`;
  return { system, user };
}

const VARIANT_LABELS = 'ABCDEFGHIJ';

/** Pull a JSON array out of a model response that may be fenced or wrapped in prose. */
function extractJsonArray(raw: string): unknown[] | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Coerce one array element (string or `{text|copy|variant|content}` object) to text. */
function elementToText(el: unknown): string | null {
  if (typeof el === 'string') return el;
  if (el && typeof el === 'object') {
    const o = el as Record<string, unknown>;
    const v = o.text ?? o.copy ?? o.variant ?? o.content;
    if (typeof v === 'string') return v;
  }
  return null;
}

/** Parse an LLM response into clean, char-limited, A/B-tagged variants. */
export function parseAdCopyVariants(raw: string, spec: PlatformCopySpec, count: number): AdCopyVariant[] {
  let texts: string[] = [];

  const arr = extractJsonArray(raw);
  if (arr) {
    texts = arr.map(elementToText).filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  }

  if (texts.length === 0) {
    // Fallback: treat each non-empty line as a variant, stripping bullets/numbering/quotes.
    texts = raw
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["'“]|["'”]$/g, '').trim())
      .filter((l) => l.length > 0);
  }

  return texts.slice(0, count).map((t, i) => {
    const trimmed = t.trim();
    const cps = [...trimmed];
    const text = cps.length > spec.limit ? cps.slice(0, spec.limit).join('').trimEnd() : trimmed;
    return { id: VARIANT_LABELS[i] ?? String(i + 1), text, chars: [...text].length };
  });
}
