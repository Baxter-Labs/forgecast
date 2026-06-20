import rawData from '../data/openmodels-t2i.json';
import { parseImageModels } from './parse';
import type { VideoModel } from './types';

export * from './types';
export * from './parse';

/** The vendored text-to-image catalog, parsed and validated at module load. */
export const imageModels = parseImageModels(rawData);

/** fal.ai text-to-video models available for selection. */
export const videoModels: VideoModel[] = [
  {
    id: 'fal-ai/wan/v2.2-5b/text-to-video',
    name: 'WAN 2.2 · 5B (fast)',
    category: 'video',
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/wan/v2.2-14b/text-to-video',
    name: 'WAN 2.2 · 14B (quality)',
    category: 'video',
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
  {
    id: 'fal-ai/wan/v2.1/text-to-video',
    name: 'WAN 2.1',
    category: 'video',
    aspectRatios: ['16:9', '9:16', '1:1'],
  },
];
