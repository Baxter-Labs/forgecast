/**
 * Client-side content guardrail — lightweight regex check for the UI.
 * Returns a warning message if the prompt contains explicit terms,
 * enabling real-time feedback in the ForgePanel textarea.
 */

const BLOCKED_PATTERNS: RegExp[] = [
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
  /\bfetish/i,
  /\bbondage\b/i,
  /\bbdsm\b/i,
  /\bstripper/i,
  /\bstriptease\b/i,
  /\bprostitut/i,
  /\bslut(?:ty)?\b/i,
  /\bwhore\b/i,
  /\bgore\b/i,
  /\bdismember/i,
  /\bdecapitat/i,
  /\bmutilat/i,
  /\btorture\b/i,
  /\bpedophil/i,
  /\bunderage\b.*\b(?:sex|nude|naked)/i,
  /\bchild\b.*\b(?:exploit|abuse|porn)/i,
  /\bdeepfake/i,
  /\bsuicide\s+bomb/i,
  /\bmass\s+shoot/i,
  /\bschool\s+shoot/i,
  /\bethnic\s+cleans/i,
  /\bwhite\s+supremac/i,
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
