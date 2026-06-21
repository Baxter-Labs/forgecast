import rawData from '../data/openmodels-t2i.json';
import { parseImageModels } from './parse';
import type { VideoModel } from './types';

export * from './types';
export * from './parse';

/** The vendored text-to-image catalog, parsed and validated at module load. */
export const imageModels = parseImageModels(rawData);

/** Curated fal.ai video models (text-to-video and image-to-video). */
export const videoModels: VideoModel[] = [
  // ── Text → Video ─────────────────────────────────────────────────────────────
  {
    id: 'fal-ai/wan/v2.2-5b/text-to-video',
    name: 'WAN 2.2 5B',
    category: 'video',
    mode: 'text-to-video',
    note: 'fast & low-cost',
    aspectRatios: ['16:9', '9:16', '1:1'],
    params: { resolution: '720p' },
  },
  {
    id: 'fal-ai/wan/v2.2-a14b/text-to-video',
    name: 'WAN 2.2 A14B',
    category: 'video',
    mode: 'text-to-video',
    note: 'standard quality',
    aspectRatios: ['16:9', '9:16', '1:1'],
    params: { resolution: '720p' },
  },
  {
    id: 'fal-ai/minimax/hailuo-2.3/standard/text-to-video',
    name: 'Hailuo 2.3',
    category: 'video',
    mode: 'text-to-video',
    note: 'reliable, strong text',
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/pixverse/v5/text-to-video',
    name: 'PixVerse v5',
    category: 'video',
    mode: 'text-to-video',
    note: 'stylized FX',
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video',
    name: 'Seedance 1.5 Pro',
    category: 'video',
    mode: 'text-to-video',
    note: 'native audio, keyframes',
    audio: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/kling-video/v3/pro/text-to-video',
    name: 'Kling 3 Pro',
    category: 'video',
    mode: 'text-to-video',
    note: 'cinematic motion + audio',
    audio: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/veo3.1/fast',
    name: 'Veo 3.1 Fast',
    category: 'video',
    mode: 'text-to-video',
    note: '4K + native audio',
    audio: true,
    aspectRatios: ['16:9', '9:16'],
  },

  // ── Image → Video ─────────────────────────────────────────────────────────────
  {
    id: 'fal-ai/wan-pro/image-to-video',
    name: 'WAN Pro',
    category: 'video',
    mode: 'image-to-video',
    note: '1080p, budget',
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    name: 'Kling 2.5 Turbo',
    category: 'video',
    mode: 'image-to-video',
    note: 'cinematic motion',
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/minimax/hailuo-2.3/standard/image-to-video',
    name: 'Hailuo 2.3 i2v',
    category: 'video',
    mode: 'image-to-video',
    note: 'low cost',
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
    name: 'Seedance 1.5 Pro i2v',
    category: 'video',
    mode: 'image-to-video',
    note: 'audio + start/end frame',
    audio: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/pixverse/v5.6/image-to-video',
    name: 'PixVerse v5.6 i2v',
    category: 'video',
    mode: 'image-to-video',
    note: 'stylized',
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/veo3.1/fast/image-to-video',
    name: 'Veo 3.1 Fast i2v',
    category: 'video',
    mode: 'image-to-video',
    note: '4K + audio',
    audio: true,
    aspectRatios: ['16:9', '9:16'],
  },
];

/**
 * Recommended default text-to-video model — a pro-tier model with strong motion
 * and native audio (over the cheaper, lower-fidelity WAN default).
 */
export const defaultVideoModelId = 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video';

/** Look up a video model by its fal endpoint id. */
export function videoModelById(id: string): VideoModel | undefined {
  return videoModels.find((m) => m.id === id);
}
