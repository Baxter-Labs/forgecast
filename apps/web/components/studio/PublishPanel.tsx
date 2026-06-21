'use client';
import { useState } from 'react';
import { Send, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import type { StudioAsset } from '@/lib/use-forgecast';

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'twitter', label: 'Twitter/X' },
  { id: 'tiktok', label: 'TikTok' },
] as const;

interface PublishPanelProps {
  asset: StudioAsset;
  publishers: string[];
  onPublish: (assetId: string, content: string, channels?: string[], publisher?: string) => Promise<{ postId?: string; status?: string; error?: string }>;
  onClose: () => void;
}

type PublishState = 'draft' | 'confirm' | 'publishing' | 'success' | 'error';

export function PublishPanel({ asset, publishers, onPublish, onClose }: PublishPanelProps) {
  const prompt = asset.params.prompt ?? '';
  const [caption, setCaption] = useState(prompt);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [publisher, setPublisher] = useState(publishers[0] ?? '');
  const [state, setState] = useState<PublishState>('draft');
  const [resultMessage, setResultMessage] = useState('');

  const isVideo = asset.type === 'video';

  function toggleChannel(id: string) {
    setSelectedChannels((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function handlePostClick() {
    if (!caption.trim()) return;
    setState('confirm');
  }

  async function handleConfirm() {
    setState('publishing');
    const channels = selectedChannels.length > 0 ? selectedChannels : undefined;
    const result = await onPublish(asset.id, caption, channels, publisher || undefined);
    if (result.error) {
      setResultMessage(result.error);
      setState('error');
    } else {
      setResultMessage(`Published! Post ID: ${result.postId ?? 'unknown'}`);
      setState('success');
    }
  }

  return (
    <div className="panel p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">
          Publish Asset
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded text-[var(--forge-faint)] hover:text-[var(--forge-text)] hover:bg-[var(--forge-surface-2)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Asset preview */}
      <div className="flex gap-3 items-start">
        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-[var(--forge-border)]">
          {isVideo ? (
            <video
              src={`/api/assets/${asset.id}/raw`}
              muted loop playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/assets/${asset.id}/raw`}
              alt={prompt}
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xs text-[var(--forge-text)] truncate">{prompt || '(no prompt)'}</p>
          <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-0.5">
            {isVideo ? 'Video' : 'Image'} · {asset.provider}
          </p>
        </div>
      </div>

      {/* Caption */}
      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--forge-faint)] mb-1.5 block">
          Caption
        </label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          disabled={state !== 'draft'}
          rows={3}
          className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--forge-surface-2)] text-[var(--forge-text)] border-[var(--forge-border)] focus:outline-none focus:border-[var(--ember-2)] transition-colors resize-none placeholder:text-[var(--forge-faint)] disabled:opacity-60"
          placeholder="Write your caption..."
        />
      </div>

      {/* Platform chips */}
      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--forge-faint)] mb-1.5 block">
          Platforms
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map((p) => {
            const selected = selectedChannels.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => state === 'draft' && toggleChannel(p.id)}
                disabled={state !== 'draft'}
                className="font-mono text-[10px] uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-md border transition-all disabled:opacity-60"
                style={selected ? {
                  borderColor: 'var(--ember-2)',
                  color: 'var(--ember-1)',
                  background: 'rgba(255,122,26,0.08)',
                } : {
                  borderColor: 'var(--forge-border)',
                  color: 'var(--forge-faint)',
                  background: 'transparent',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {selectedChannels.length === 0 && state === 'draft' && (
          <p className="font-mono text-[9px] text-[var(--forge-faint)] mt-1.5 italic">
            No platforms selected — will post to all connected channels
          </p>
        )}
      </div>

      {/* Publisher picker */}
      {publishers.length > 1 && (
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--forge-faint)] mb-1.5 block">
            Publisher
          </label>
          <select
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            disabled={state !== 'draft'}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--forge-surface-2)] text-[var(--forge-text)] border-[var(--forge-border)] focus:outline-none focus:border-[var(--ember-2)] transition-colors disabled:opacity-60"
          >
            {publishers.map((pub) => (
              <option key={pub} value={pub}>{pub}</option>
            ))}
          </select>
        </div>
      )}

      {/* No publishers warning */}
      {publishers.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 border border-[var(--forge-border)] bg-[var(--forge-surface-2)]">
          <AlertCircle size={14} className="text-[var(--ember-1)] shrink-0" />
          <p className="font-mono text-[10px] text-[var(--forge-muted)]">
            No publishing backend configured. Set an OMNISOCIALS_API_KEY secret — locally in <span className="text-[var(--forge-text)]">.env</span>/<span className="text-[var(--forge-text)]">.dev.vars</span>, or on Cloudflare with <span className="text-[var(--forge-text)]">wrangler secret put OMNISOCIALS_API_KEY</span> then redeploy.
          </p>
        </div>
      )}

      {/* Action buttons */}
      {state === 'draft' && (
        <button
          onClick={handlePostClick}
          disabled={!caption.trim() || publishers.length === 0}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-mono text-[11px] uppercase tracking-[0.12em] border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            borderColor: 'var(--ember-2)',
            color: 'var(--ember-1)',
            background: 'rgba(255,122,26,0.08)',
          }}
        >
          <Send size={13} />
          Publish
        </button>
      )}

      {/* Confirmation step */}
      {state === 'confirm' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg px-3 py-2.5 border border-[var(--ember-2)] bg-[rgba(255,122,26,0.05)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ember-1)] mb-1">
              Ready to post?
            </p>
            <p className="text-xs text-[var(--forge-muted)] leading-relaxed">
              This will publish your {isVideo ? 'video' : 'image'} with the caption above
              {selectedChannels.length > 0 ? ` to ${selectedChannels.join(', ')}` : ' to all connected channels'}
              {publisher ? ` via ${publisher}` : ''}.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setState('draft')}
              className="flex-1 py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.12em] border border-[var(--forge-border)] text-[var(--forge-faint)] hover:text-[var(--forge-text)] transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.12em] border transition-all"
              style={{
                borderColor: 'var(--ember-2)',
                color: '#1a0c03',
                background: 'var(--molten)',
                boxShadow: '0 0 16px var(--ember-glow)',
              }}
            >
              <Check size={13} />
              Confirm Post
            </button>
          </div>
        </div>
      )}

      {/* Publishing state */}
      {state === 'publishing' && (
        <div className="flex items-center justify-center gap-2 py-3">
          <Loader2 size={16} className="animate-spin text-[var(--ember-1)]" />
          <span className="font-mono text-[11px] text-[var(--forge-muted)]">Publishing...</span>
        </div>
      )}

      {/* Success state */}
      {state === 'success' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 border border-green-600/40 bg-green-900/10">
            <Check size={14} className="text-green-400 shrink-0" />
            <p className="font-mono text-[10px] text-green-300">{resultMessage}</p>
          </div>
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.12em] border border-[var(--forge-border)] text-[var(--forge-faint)] hover:text-[var(--forge-text)] transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 border border-red-600/40 bg-red-900/10">
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <p className="font-mono text-[10px] text-red-300">{resultMessage}</p>
          </div>
          <button
            onClick={() => setState('draft')}
            className="w-full py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.12em] border border-[var(--forge-border)] text-[var(--forge-faint)] hover:text-[var(--forge-text)] transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
