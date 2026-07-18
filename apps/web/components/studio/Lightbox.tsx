'use client';
import { useEffect, useRef } from 'react';
import { X, Download } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { StudioAsset } from '@/lib/use-forgecast';

interface LightboxProps {
  asset: StudioAsset;
  onClose: () => void;
}

export function Lightbox({ asset, onClose }: LightboxProps) {
  const isVideo = asset.type === 'video';
  const prompt = asset.params.prompt ?? '';
  const videoTag = asset.provider === 'remotion' ? 'MONTAGE' : 'VIDEO';
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Move focus into the lightbox so Escape / tabbing work without a stray click.
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={prompt ? `Asset preview: ${prompt}` : 'Asset preview'}
      className="fixed inset-0 z-lightbox flex items-center justify-center outline-none"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <a
        href={`/api/assets/${asset.id}/raw?download=1`}
        download
        onClick={(e) => e.stopPropagation()}
        title="Download"
        aria-label="Download asset"
        className="absolute top-4 right-16 flex items-center gap-1.5 px-3 py-2 rounded-full font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      >
        <Download size={16} />
        Download
      </a>
      <button
        onClick={onClose}
        aria-label="Close preview"
        className="tap-target absolute top-4 right-4 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
      >
        <X size={22} />
      </button>

      <div
        className="flex flex-col items-center gap-3 max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={`/api/assets/${asset.id}/raw`}
            controls autoPlay loop playsInline
            className="max-w-full max-h-[80vh] rounded-lg"
            style={{ boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/assets/${asset.id}/raw`}
            alt={prompt}
            className="max-w-full max-h-[80vh] rounded-lg object-contain"
            style={{ boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}
          />
        )}
        <div className="flex items-center gap-3 px-2">
          {isVideo && (
            <span
              className="font-mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'var(--molten)', color: '#1a0c03' }}
            >
              {videoTag}
            </span>
          )}
          {prompt && (
            <p className="font-mono text-xs text-white/50 text-center leading-relaxed">{prompt}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
