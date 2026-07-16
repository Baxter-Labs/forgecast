import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
} from 'remotion';
import { planTimeline } from './timeline';
import type { MontageSpec } from './timeline';

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

interface TransitionProps {
  transition: 'fade' | 'slide' | 'none';
  durationInFrames: number;
}

function useTransitionStyle({ transition, durationInFrames }: TransitionProps): React.CSSProperties {
  const frame = useCurrentFrame();
  const fadeDuration = Math.min(10, Math.floor(durationInFrames * 0.25));

  switch (transition) {
    case 'fade': {
      const opacity = interpolate(frame, [0, fadeDuration], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { opacity };
    }
    case 'slide': {
      const translateX = interpolate(frame, [0, fadeDuration], [-100, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return { transform: `translateX(${translateX}%)` };
    }
    case 'none':
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Scene renderer
// ---------------------------------------------------------------------------

interface SceneProps {
  url: string;
  kind: 'image' | 'video';
  caption?: string;
  transition: 'fade' | 'slide' | 'none';
  durationInFrames: number;
}

function Scene({ url, kind, caption, transition, durationInFrames }: SceneProps): React.ReactElement {
  const style = useTransitionStyle({ transition, durationInFrames });

  return (
    <AbsoluteFill style={style}>
      {kind === 'image' ? (
        <Img
          src={url}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <OffthreadVideo
          src={url}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}

      {caption !== undefined && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px 24px',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            fontSize: 40,
            fontFamily: 'sans-serif',
            lineHeight: 1.4,
          }}
        >
          {caption}
        </div>
      )}
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// Main composition component
// ---------------------------------------------------------------------------

export interface MontageProps {
  spec: MontageSpec;
}

export function Montage({ spec }: MontageProps): React.ReactElement {
  const timeline = planTimeline(spec);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Narration track (synthesized upstream — see the web app's voiceover pipeline).
          When present, background music is ducked underneath it. */}
      {spec.voiceoverUrl !== undefined && <Audio src={spec.voiceoverUrl} />}
      {spec.musicUrl !== undefined && <Audio src={spec.musicUrl} volume={spec.voiceoverUrl !== undefined ? 0.25 : 1} />}

      {timeline.scenes.map((s) => (
        <Sequence key={s.index} from={s.fromFrame} durationInFrames={s.durationInFrames}>
          <Scene
            url={s.url}
            kind={s.kind}
            caption={s.caption}
            transition={s.transition}
            durationInFrames={s.durationInFrames}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
