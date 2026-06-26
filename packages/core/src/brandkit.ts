/**
 * A project's brand kit — the identity that grounds every generation so images,
 * video, montages, and agent campaigns come out on-brand. Stored per project and
 * folded into generation prompts via `applyBrandKit`.
 */
export interface BrandKit {
  name?: string;
  tagline?: string;
  /** Hex colors, e.g. ["#0A0604", "#FF7A1A", "#FFC24B"]. */
  palette?: string[];
  fonts?: { display?: string; body?: string };
  toneOfVoice?: string;
  /** Short brand messages / value props to weave in. */
  keyMessages?: string[];
  /** Asset id of an uploaded logo, if any. */
  logoAssetId?: string;
  /** Freeform brand direction appended verbatim to prompts. */
  notes?: string;
  /** Set when the kit was derived from a website. */
  sourceUrl?: string;
}

/** True when the kit carries no usable brand signal. */
export function isEmptyBrandKit(kit: BrandKit | null | undefined): boolean {
  if (!kit) return true;
  return !(
    kit.name ||
    kit.tagline ||
    (kit.palette && kit.palette.length > 0) ||
    kit.fonts?.display ||
    kit.fonts?.body ||
    kit.toneOfVoice ||
    (kit.keyMessages && kit.keyMessages.length > 0) ||
    kit.logoAssetId ||
    (kit.notes && kit.notes.trim().length > 0)
  );
}

/** Renders a brand kit into a compact, model-readable prompt preamble. */
export function brandKitToPrompt(kit: BrandKit): string {
  const facets: string[] = [];
  if (kit.name) facets.push(`brand "${kit.name}"${kit.tagline ? ` (${kit.tagline})` : ''}`);
  if (kit.palette && kit.palette.length > 0) facets.push(`brand colors ${kit.palette.join(', ')}`);
  const fonts = [kit.fonts?.display, kit.fonts?.body].filter((f): f is string => Boolean(f));
  if (fonts.length > 0) facets.push(`typography ${fonts.join(' + ')}`);
  if (kit.toneOfVoice) facets.push(`tone ${kit.toneOfVoice}`);
  if (kit.keyMessages && kit.keyMessages.length > 0) facets.push(`key messages: ${kit.keyMessages.join('; ')}`);

  let out = facets.length > 0 ? `On-brand for ${facets.join('; ')}.` : '';
  if (kit.notes && kit.notes.trim().length > 0) {
    out = out ? `${out} ${kit.notes.trim()}` : kit.notes.trim();
  }
  return out;
}

/** Prepends the brand preamble to a user prompt; a no-op for an empty/absent kit. */
export function applyBrandKit(kit: BrandKit | null | undefined, prompt: string): string {
  if (isEmptyBrandKit(kit)) return prompt;
  const preamble = brandKitToPrompt(kit as BrandKit);
  return preamble ? `${preamble}\n\n${prompt}` : prompt;
}
