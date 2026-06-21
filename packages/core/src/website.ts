export interface WebsiteInfo {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  headings: string[];   // h1/h2/h3 text
  text: string;         // cleaned main body text, truncated
  images: string[];     // absolute image URLs (og:image + prominent <img>), deduped
}

export interface WebsiteReader {
  read(url: string): Promise<WebsiteInfo>;
}
