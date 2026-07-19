'use client';
import { useState } from 'react';
import { ChevronDown, Trash2, Sparkles, ImageIcon, Video } from 'lucide-react';
import { ConfirmDialog } from '../studio/ConfirmDialog';

export interface BoardIdea {
  id: string;
  kind: 'image' | 'video';
  prompt: string;
  aspectRatio?: string;
  model?: string;
  assetId?: string;
}
export interface BoardCaption {
  platform: string;
  caption: string;
}
export interface Board {
  id: string;
  title: string;
  brief: string;
  platforms: string[];
  concept: string;
  trendingNotes?: string;
  ideas: BoardIdea[];
  captions: BoardCaption[];
  createdAt: string;
}

interface BrainstormBoardCardProps {
  board: Board;
  /** Forge one idea; resolves once the request settles. */
  onGenerate: (ideaId: string) => Promise<void>;
  onRemove: () => void;
  /** Per-idea in-flight / error state, keyed by idea id. */
  generatingId: string | null;
  ideaError: { ideaId: string; message: string } | null;
  canGenerate: boolean;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-1.5">
      {children}
    </p>
  );
}

export function BrainstormBoardCard({ board, onGenerate, onRemove, generatingId, ideaError, canGenerate }: BrainstormBoardCardProps) {
  const [open, setOpen] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const forged = board.ideas.filter((i) => i.assetId).length;

  return (
    <div className="panel p-5 overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 flex-1 text-left min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] shrink-0">Board</span>
          <span className="text-[var(--forge-border)] shrink-0">·</span>
          <span className="text-sm text-[var(--forge-text)] truncate min-w-0">{board.title || board.concept || 'Untitled board'}</span>
          <ChevronDown size={14} className="text-[var(--forge-faint)] transition-transform shrink-0 ml-1" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
        <span className="font-mono text-[10px] text-[var(--forge-faint)] shrink-0">
          {forged}/{board.ideas.length} forged
        </span>
        <button
          onClick={() => setConfirming(true)}
          title="Delete board"
          aria-label="Delete board"
          className="tap-target rounded text-[var(--forge-faint)] hover:text-[var(--ember-3)] hover:bg-[var(--forge-surface-2)] transition-colors shrink-0"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete board?"
          description={`"${board.title || board.concept || 'this board'}" and its ideas will be removed. Generated assets stay in your gallery.`}
          confirmLabel="Delete"
          onConfirm={() => { setConfirming(false); onRemove(); }}
          onCancel={() => setConfirming(false)}
        />
      )}

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Platforms */}
          {board.platforms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {board.platforms.map((p) => (
                <span key={p} className="font-mono text-[10px] lowercase px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}>
                  {p}
                </span>
              ))}
            </div>
          )}

          {/* Concept */}
          {board.concept && (
            <div>
              <FieldLabel>Concept</FieldLabel>
              <p className="text-sm text-[var(--forge-text)] leading-relaxed">{board.concept}</p>
            </div>
          )}

          {/* Trend */}
          {board.trendingNotes && (
            <div className="rounded-lg px-3 py-2.5 border" style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}>
              <FieldLabel>Trend</FieldLabel>
              <p className="text-xs italic text-[var(--forge-muted)] leading-relaxed">{board.trendingNotes}</p>
            </div>
          )}

          {/* Ideas — the pickable, generatable prompts */}
          {board.ideas.length > 0 && (
            <div>
              <FieldLabel>Ideas · pick one to forge</FieldLabel>
              <div className="flex flex-col gap-2">
                {board.ideas.map((idea) => {
                  const busy = generatingId === idea.id;
                  const err = ideaError?.ideaId === idea.id ? ideaError.message : null;
                  return (
                    <div key={idea.id} className="rounded-md px-2.5 py-2 border" style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}>
                      <div className="flex items-start gap-2.5">
                        {idea.assetId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          idea.kind === 'video'
                            ? <video src={`/api/assets/${idea.assetId}/raw`} muted playsInline preload="metadata" className="w-12 h-12 rounded object-cover shrink-0 border border-[var(--forge-border)]" />
                            : <img src={`/api/assets/${idea.assetId}/raw`} alt="" loading="lazy" className="w-12 h-12 rounded object-cover shrink-0 border border-[var(--forge-border)]" />
                        ) : (
                          <span className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0 mt-px inline-flex items-center gap-1" style={{ color: 'var(--ember-1)', border: '1px solid var(--ember-2)' }}>
                            {idea.kind === 'video' ? <Video size={10} /> : <ImageIcon size={10} />}
                            {idea.kind}
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-[var(--forge-muted)] leading-relaxed flex-1" style={{ overflowWrap: 'break-word', minWidth: 0 }}>{idea.prompt}</span>
                        {idea.assetId ? (
                          <span className="font-mono text-[10px] text-[var(--ember-1)] shrink-0 self-center">forged ✓</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void onGenerate(idea.id)}
                            disabled={busy || !canGenerate}
                            title={canGenerate ? 'Forge this idea into the gallery' : 'No generation provider available'}
                            className={`shrink-0 self-center inline-flex items-center gap-1 rounded-md py-1 px-2.5 text-[10px] font-mono uppercase tracking-[0.1em] border transition-all disabled:opacity-40 ${busy ? 'forging' : ''}`}
                            style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-1)', background: 'transparent' }}
                          >
                            <Sparkles size={11} />
                            {busy ? (idea.kind === 'video' ? 'starting…' : 'forging…') : 'Generate'}
                          </button>
                        )}
                      </div>
                      {err && <p className="font-mono text-[10px] text-[var(--ember-3)] mt-1.5 leading-relaxed">{err}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Captions */}
          {board.captions.length > 0 && (
            <div>
              <FieldLabel>Captions</FieldLabel>
              <div className="grid sm:grid-cols-2 gap-2">
                {board.captions.map((c, i) => (
                  <div key={i} className="rounded-lg px-3 py-2.5 border" style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ember-1)] opacity-80 mb-1.5">{c.platform}</p>
                    <p className="text-xs text-[var(--forge-text)] leading-relaxed">{c.caption}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
