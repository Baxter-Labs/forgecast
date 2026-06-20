import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary path via __dirname; Next's server bundler
  // rewrites that to a bogus "/ROOT/..." path, breaking the in-process montage
  // render. Keeping it external lets it be require()'d at runtime with the real
  // path so spawn() finds the bundled ffmpeg binary.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
