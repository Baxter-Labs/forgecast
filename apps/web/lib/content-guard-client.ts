/**
 * Client-side content guardrail — same patterns as server-side content-guard.ts.
 * Enables real-time feedback in the ForgePanel textarea.
 *
 * All matching uses word-boundary regex to avoid false positives
 * (e.g. "category" does NOT match "gory", "escorted" does NOT match "escort").
 */

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

/**
 * Returns null if clean, or an error string if blocked.
 */
export function promptGuardCheck(text: string): string | null {
  if (!text || text.trim().length === 0) return null;
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return 'Prompt contains explicit or prohibited content';
    }
  }
  return null;
}
