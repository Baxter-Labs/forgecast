/**
 * Content guardrails — rejects prompts containing explicit, NSFW, or violent keywords.
 * Called server-side in generate routes to prevent misuse of the generation APIs.
 *
 * All matching uses word-boundary regex to avoid false positives
 * (e.g. "category" does NOT match "gory", "escorted" does NOT match "escort").
 */

// All patterns use \b word boundaries to prevent substring false positives.
const BLOCKED_PATTERNS: RegExp[] = [
  // Sexual content
  /\bnude[sd]?\b/i,
  /\bnaked\b/i,
  /\bporn(?:ograph(?:y|ic))?\b/i,
  /\bhentai\b/i,
  /\bnsfw\b/i,
  /\bxxx\b/i,
  /\berotic(?:a|ism)?\b/i,
  /\bgenital(?:ia|s)?\b/i,
  /\borgasm/i,
  /\bmasturbat/i,
  /\bintercourse\b/i,
  /\bfetish\b/i,
  /\bbondage\b/i,
  /\bbdsm\b/i,
  /\bdominatrix\b/i,
  /\bstripper[s]?\b/i,
  /\bstriptease\b/i,
  /\bsex\s+act/i,
  /\bsex\s+scene/i,
  /\blovemaking\b/i,
  /\btopless\b/i,
  /\bbottomless\b/i,
  /\bplayboy\b/i,
  /\bonlyfans\b/i,
  /\bcamgirl\b/i,
  /\bescort\s+service/i,
  /\bprostitut/i,
  /\bhooker[s]?\b/i,
  /\bslut(?:ty|s)?\b/i,
  /\bwhore[s]?\b/i,
  /\bpenis\b/i,
  /\bvagina\b/i,
  // Violence / gore (avoid matching proper nouns like "Al Gore")
  /\b(?:blood(?:y)?\s+(?:and\s+)?)?gore\b(?!\s+(?:climate|vidal|tex))/i,
  /\bgory\b/i,
  /\bdismember/i,
  /\bdecapitat/i,
  /\bmutilat/i,
  /\btorture\b/i,
  /\bgruesome\s+death/i,
  /\bbloody\s+corpse/i,
  /\bdead\s+bod(?:y|ies)\b/i,
  /\bmurder\s+scene/i,
  /\bmass\s+shoot/i,
  /\bterrorist\s+attack/i,
  /\bsuicide\s+bomb/i,
  /\bschool\s+shoot/i,
  // Child safety
  /\bchild\b.*\b(?:exploit|abuse|porn)/i,
  /\bpedophil/i,
  /\bunderage\b.*\b(?:sex|nude|naked)/i,
  // Hate / extremism
  /\bnazi\b/i,
  /\bwhite\s+supremac/i,
  /\bethnic\s+cleans/i,
  /\bgenocide\b/i,
  /\bhate\s+crime/i,
  /\bracial\s+slur/i,
  /\bblackface\b/i,
  // Drug manufacturing
  /\bcook\s+meth/i,
  /\bdrug\s+manufactur/i,
  // Deepfakes / impersonation
  /\bdeepfake/i,
];

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check a prompt (or any text) against the explicit content blocklist.
 * Returns `{ allowed: true }` if clean, or `{ allowed: false, reason }` if blocked.
 */
export function checkContentGuard(text: string): GuardResult {
  if (!text || text.trim().length === 0) return { allowed: true };

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: 'Content contains explicit or prohibited language' };
    }
  }

  return { allowed: true };
}
