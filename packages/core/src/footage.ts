/**
 * Stock / archival footage search — the "find real motion footage by topic" idea
 * borrowed from OpenMontage's documentary pipeline. A vendor-neutral contract so
 * any open footage source (Pexels, Pixabay, Wikimedia, …) drops in as an adapter,
 * and the results can be imported into a project and montaged.
 */

/** One real footage clip found by a search. */
export interface FootageClip {
  id: string;
  /** Direct, fetchable video URL (mp4/webm). */
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  /** Source name, e.g. 'pexels'. */
  source: string;
  /** Attribution — the creator's name, when provided. */
  author?: string;
  /** The source page (for attribution / licensing). */
  pageUrl?: string;
}

export interface FootageSearchInput {
  query: string;
  /** How many results to return (provider caps apply). */
  perPage?: number;
  orientation?: 'portrait' | 'landscape' | 'square';
}

/** A searchable source of real footage clips. */
export interface FootageProvider {
  readonly name: string;
  isAvailable(): boolean;
  search(input: FootageSearchInput): Promise<FootageClip[]>;
}
