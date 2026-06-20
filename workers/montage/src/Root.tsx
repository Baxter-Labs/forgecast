import React from 'react';
import { Composition } from 'remotion';
import { Montage } from './Montage';
import { planTimeline } from './timeline';
import type { MontageSpec } from './timeline';

// ---------------------------------------------------------------------------
// Default props (tiny placeholder so Remotion Studio loads cleanly)
// ---------------------------------------------------------------------------

const DEFAULT_SPEC: MontageSpec = {
  scenes: [
    {
      url: 'https://images.unsplash.com/photo-1560807707-8cc77767d783?w=1080',
      kind: 'image',
      durationSec: 3,
      caption: 'Forgecast Montage',
      transition: 'fade',
    },
  ],
  aspectRatio: '9:16',
  fps: 30,
};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function RemotionRoot(): React.ReactElement {
  return (
    <Composition
      id="Montage"
      component={Montage}
      defaultProps={{ spec: DEFAULT_SPEC }}
      calculateMetadata={async ({ props }) => {
        const spec = props.spec ?? DEFAULT_SPEC;
        const tl = planTimeline(spec);
        return {
          durationInFrames: tl.totalDurationInFrames,
          fps: tl.fps,
          width: tl.width,
          height: tl.height,
        };
      }}
      // Fallback static values (overridden at runtime by calculateMetadata)
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
    />
  );
}
