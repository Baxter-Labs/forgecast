'use client';
import { useCallback, useRef, useState } from 'react';

/**
 * Draggable before/after compare for two image assets. Drag anywhere on the image
 * (mouse or touch) to reveal; the labelled range slider beneath gives keyboard
 * access (accessibility) so it's not pointer-only.
 */
export function BeforeAfter({ beforeId, afterId }: { beforeId: string; afterId: string }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);

  const setFromClientX = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, p)));
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={ref}
        className="relative select-none overflow-hidden bg-black cursor-ew-resize"
        onMouseDown={(e) => setFromClientX(e.clientX)}
        onMouseMove={(e) => { if (e.buttons === 1) setFromClientX(e.clientX); }}
        onTouchStart={(e) => { const t = e.touches[0]; if (t) setFromClientX(t.clientX); }}
        onTouchMove={(e) => { const t = e.touches[0]; if (t) setFromClientX(t.clientX); }}
      >
        {/* After (full) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/assets/${afterId}/raw`} alt="after" className="block w-full max-h-[68vh] object-contain pointer-events-none" />
        {/* Before (clipped to the left of the handle) */}
        <div className="absolute inset-0 pointer-events-none" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/assets/${beforeId}/raw`} alt="before" className="block w-full max-h-[68vh] object-contain" />
        </div>
        {/* Handle */}
        <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}>
          <div className="w-0.5 h-full" style={{ background: 'var(--ember-1)', boxShadow: '0 0 10px var(--ember-glow)' }} />
        </div>
        <span className="absolute top-2 left-2 font-mono text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded pointer-events-none" style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}>Before</span>
        <span className="absolute top-2 right-2 font-mono text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded pointer-events-none" style={{ background: 'var(--molten)', color: '#1a0c03' }}>After</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Reveal before / after"
        className="w-full accent-[var(--ember-2)] cursor-pointer"
      />
    </div>
  );
}
