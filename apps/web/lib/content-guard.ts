/**
 * Content guardrails — rejects prompts containing explicit, NSFW, or violent keywords.
 * Called server-side in generate routes to prevent misuse of the generation APIs.
 */

// Explicit/NSFW terms — keep lowercase, checked against lowercased input.
const BLOCKED_TERMS: string[] = [
  // Sexual content
  'nude', 'nudes', 'naked', 'nsfw', 'pornography', 'porn', 'xxx',
  'hentai', 'erotic', 'erotica', 'sexual', 'sexually explicit',
  'genitalia', 'genitals', 'penis', 'vagina', 'breasts exposed',
  'topless', 'bottomless', 'orgasm', 'masturbat', 'intercourse',
  'fetish', 'bondage', 'bdsm', 'dominatrix', 'stripper', 'striptease',
  'sex act', 'sex scene', 'lovemaking', 'provocative nude',
  'lingerie model', 'playboy', 'onlyfans', 'camgirl', 'escort',
  'prostitut', 'hooker', 'slutty', 'slut', 'whore',
  // Violence / gore
  'gore', 'gory', 'dismember', 'decapitat', 'mutilat', 'torture',
  'gruesome death', 'bloody corpse', 'dead body', 'murder scene',
  'mass shooting', 'terrorist attack', 'suicide bomb', 'school shooting',
  'child abuse', 'child exploitation', 'pedophil', 'underage',
  // Hate / extremism
  'nazi', 'white supremac', 'ethnic cleansing', 'genocide',
  'hate crime', 'racial slur', 'blackface',
  // Drug abuse (explicit manufacturing)
  'cook meth', 'make drugs', 'drug manufacturing',
  // Deepfakes / impersonation
  'deepfake', 'face swap without consent',
];

// Regex patterns for more nuanced matching (word boundaries, combinations).
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

  const lower = text.toLowerCase();

  // Check exact substring matches.
  for (const term of BLOCKED_TERMS) {
    if (lower.includes(term)) {
      return { allowed: false, reason: `Content contains prohibited term: "${term}"` };
    }
  }

  // Check regex patterns.
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: 'Content contains explicit or prohibited language' };
    }
  }

  return { allowed: true };
}
