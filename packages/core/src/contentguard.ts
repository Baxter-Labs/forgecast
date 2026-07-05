/**
 * Content guardrails — a small, pure, deterministic safety check run before any
 * generation. It hard-blocks the critical, non-negotiable category (sexual content
 * involving minors) and supports an operator-configurable blocklist for policy- or
 * brand-specific terms (slurs, competitors, …).
 *
 * All matching is **word-boundary** (`\b`) based so innocent substrings never trip
 * it — e.g. "category", "asexual", "escorted", "Al Gore", "an 18-year-old model"
 * are all allowed. Adult content on its own is *not* blocked here (that's an
 * operator policy choice via the blocklist); only the minors intersection is.
 */

export type ContentCategory = 'sexual_minors' | 'blocklist';

export interface ContentCheckResult {
  ok: boolean;
  /** Present when blocked. */
  category?: ContentCategory;
  /** Human-readable reason, safe to surface to the user. */
  reason?: string;
}

// Terms indicating a minor. The age clause matches 0–17 year-olds but NOT 18+.
const MINOR =
  /\b(?:child|children|kid|kids|minor|minors|underage|under-?age|teen|teens|teenager|teenagers|preteen|pre-?teen|toddler|toddlers|infant|infants|baby|babies|prepubescent|schoolgirl|schoolboy|(?:[0-9]|1[0-7])[\s-]*year[\s-]*old)\b/i;

// Terms indicating sexual content. Blocks only when it co-occurs with a minor term.
const SEXUAL =
  /\b(?:nude|nudes|naked|nudity|nsfw|porn|pornographic|pornography|sexual|sexually|sex|explicit|erotic|erotica|fetish|lewd|genitals?|breasts?|topless)\b/i;

// Standalone hard-block terms (no co-occurrence needed).
const CSAM = /\b(?:csam|child\s*porn(?:ography)?|child\s*sexual)\b/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check a piece of user text against the guardrails.
 * @param text the prompt / brief / script to check
 * @param blocklist optional extra terms to block (word-boundary, case-insensitive)
 */
export function checkContent(text: string, blocklist: readonly string[] = []): ContentCheckResult {
  const t = text ?? '';
  if (CSAM.test(t) || (MINOR.test(t) && SEXUAL.test(t))) {
    return { ok: false, category: 'sexual_minors', reason: 'sexual content involving minors is not permitted' };
  }
  for (const raw of blocklist) {
    const term = raw.trim();
    if (term.length === 0) continue;
    if (new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(t)) {
      return { ok: false, category: 'blocklist', reason: 'contains content blocked by this instance' };
    }
  }
  return { ok: true };
}

/** Convenience boolean: true when the text is allowed. */
export function isContentAllowed(text: string, blocklist: readonly string[] = []): boolean {
  return checkContent(text, blocklist).ok;
}
