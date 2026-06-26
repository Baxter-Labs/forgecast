'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Activity, RefreshCw, Loader2, AlertCircle, Sparkles } from 'lucide-react';

interface FatigueItem { creativeId: string; name?: string; status: string; score: number; reasons: string[] }
interface Dimension { key: string; label: string; score: number; findings: string[] }
interface Audit { score: number; grade: string; dimensions: Dimension[]; fatigue: FatigueItem[]; recommendations: string[] }
interface Optimization { creativeId: string; name?: string; brief: string; newAssetId: string | null }

interface Props {
  open: boolean;
  onClose: () => void;
  onAudit: (metrics: unknown[]) => Promise<{ audit?: unknown; error?: string }>;
  onOptimize: (metrics: unknown[], max: number) => Promise<{ imageReady?: boolean; regenerated?: Array<{ creativeId: string; newAssetId: string }>; optimizations?: unknown[]; note?: string; error?: string }>;
}

/** A small demo dataset so the panel is usable instantly without a connected ad account. */
function sampleMetrics(): unknown[] {
  const rows: unknown[] = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const day = String(i + 1).padStart(2, '0');
    rows.push({ creativeId: 'hero-a', name: 'Hero A', platform: 'meta', date: `2026-06-${day}`, impressions: 3000, clicks: Math.round(3000 * (0.03 - 0.02 * t)), spend: 55, frequency: Math.round((1.4 + 2.4 * t) * 10) / 10 });
    rows.push({ creativeId: 'hero-b', name: 'Hero B', platform: 'meta', date: `2026-06-${day}`, impressions: 2500, clicks: Math.round(2500 * 0.024), spend: 48 });
  }
  return rows;
}

const STATUS_COLOR: Record<string, string> = {
  fatigued: '#ff5a5a', watch: 'var(--ember-1)', fresh: '#4ade80', insufficient_data: 'var(--forge-faint)',
};
function scoreColor(s: number): string {
  return s >= 75 ? '#4ade80' : s >= 60 ? 'var(--ember-1)' : '#ff5a5a';
}

export function PerformancePanel({ open, onClose, onAudit, onOptimize }: Props) {
  const [raw, setRaw] = useState('');
  const [audit, setAudit] = useState<Audit | null>(null);
  const [opt, setOpt] = useState<{ regenerated?: Array<{ creativeId: string; newAssetId: string }>; optimizations?: Optimization[]; note?: string } | null>(null);
  const [loading, setLoading] = useState<'audit' | 'optimize' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  function parseMetrics(): unknown[] | null {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) { setError('Paste a non-empty JSON array of metric rows.'); return null; }
      return parsed;
    } catch {
      setError('That isn’t valid JSON. Use the “Load sample” button to see the shape.');
      return null;
    }
  }

  async function runAudit() {
    setError(''); setOpt(null);
    const metrics = parseMetrics();
    if (!metrics) return;
    setLoading('audit');
    const r = await onAudit(metrics);
    setLoading(null);
    if (r.error || !r.audit) { setError(r.error ?? 'Audit failed.'); setAudit(null); return; }
    setAudit(r.audit as Audit);
  }

  async function runOptimize() {
    setError('');
    const metrics = parseMetrics();
    if (!metrics) return;
    setLoading('optimize');
    const r = await onOptimize(metrics, 3);
    setLoading(null);
    if (r.error) { setError(r.error); return; }
    setOpt({ regenerated: r.regenerated, optimizations: r.optimizations as Optimization[] | undefined, note: r.note });
  }

  const fatiguedCount = audit?.fatigue.filter((f) => f.status === 'fatigued').length ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-8" onClick={onClose}>
      <div className="panel w-full max-w-2xl my-auto p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-[var(--ember-1)]" />
            <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--forge-text)]">Ad Performance</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded text-[var(--forge-faint)] hover:text-[var(--forge-text)] hover:bg-[var(--forge-surface-2)] transition-colors">
            <X size={14} />
          </button>
        </div>

        <p className="text-xs text-[var(--forge-muted)] leading-relaxed">
          Paste per-creative, per-day ad metrics (or pull from a connected account). Forgecast scores account health,
          diagnoses <span className="text-[var(--forge-text)]">creative fatigue</span>, and can regenerate tired
          creatives on-brand — closing the create → measure → optimize loop.
        </p>

        {/* Metrics input */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--forge-faint)]">Metrics JSON</label>
            <button onClick={() => { setRaw(JSON.stringify(sampleMetrics(), null, 2)); setError(''); }} className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ember-1)] hover:underline">
              Load sample
            </button>
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder='[{"creativeId":"hero-a","name":"Hero A","date":"2026-06-01","impressions":3000,"clicks":80,"spend":55,"frequency":1.4}, …]'
            className="w-full rounded-lg border px-3 py-2 text-[11px] font-mono bg-[var(--forge-surface-2)] text-[var(--forge-text)] border-[var(--forge-border)] focus:outline-none focus:border-[var(--ember-2)] transition-colors resize-y placeholder:text-[var(--forge-faint)]"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={runAudit}
            disabled={loading !== null || !raw.trim()}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.12em] border transition-all disabled:opacity-40"
            style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-1)', background: 'rgba(255,122,26,0.08)' }}
          >
            {loading === 'audit' ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
            Run audit
          </button>
          {audit && fatiguedCount > 0 && (
            <button
              onClick={runOptimize}
              disabled={loading !== null}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.12em] border transition-all disabled:opacity-40"
              style={{ borderColor: 'var(--ember-2)', color: '#1a0c03', background: 'var(--molten)', boxShadow: '0 0 16px var(--ember-glow)' }}
            >
              {loading === 'optimize' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh {fatiguedCount} fatigued on-brand
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 border border-red-600/40 bg-red-900/10">
            <AlertCircle size={13} className="text-red-400 shrink-0" />
            <p className="font-mono text-[10px] text-red-300">{error}</p>
          </div>
        )}

        {/* Audit result */}
        {audit && (
          <div className="flex flex-col gap-3 border-t border-[var(--forge-border)] pt-3">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center justify-center w-16 h-16 rounded-xl border shrink-0" style={{ borderColor: scoreColor(audit.score) }}>
                <span className="text-2xl font-semibold leading-none" style={{ color: scoreColor(audit.score) }}>{audit.grade}</span>
                <span className="font-mono text-[9px] text-[var(--forge-faint)] mt-0.5">{audit.score}/100</span>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {audit.dimensions.map((d) => (
                  <div key={d.key} className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-[var(--forge-muted)] w-28 shrink-0 truncate">{d.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--forge-surface-2)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${d.score}%`, background: scoreColor(d.score) }} />
                    </div>
                    <span className="font-mono text-[9px] text-[var(--forge-faint)] tabular-nums w-6 text-right">{d.score}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fatigue list */}
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--forge-faint)]">Creative fatigue</span>
              {audit.fatigue.map((f) => (
                <div key={f.creativeId} className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 border border-[var(--forge-border)] bg-[var(--forge-surface-2)]">
                  <span className="font-mono text-[8px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded mt-0.5 shrink-0" style={{ color: STATUS_COLOR[f.status] ?? 'var(--forge-faint)', border: `1px solid ${STATUS_COLOR[f.status] ?? 'var(--forge-border)'}` }}>
                    {f.status.replace('_', ' ')}
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-[var(--forge-text)] truncate">{f.name ?? f.creativeId}</p>
                    <p className="text-[10px] text-[var(--forge-muted)] leading-snug">{f.reasons[0]}</p>
                  </div>
                </div>
              ))}
            </div>

            {audit.recommendations.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--forge-faint)]">Recommendations</span>
                {audit.recommendations.map((rec, i) => (
                  <p key={i} className="text-[11px] text-[var(--forge-muted)] leading-snug flex gap-1.5"><span className="text-[var(--ember-1)]">›</span>{rec}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Optimize result */}
        {opt && (
          <div className="flex flex-col gap-2 border-t border-[var(--forge-border)] pt-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--forge-faint)] flex items-center gap-1.5">
              <Sparkles size={11} className="text-[var(--ember-1)]" /> On-brand refreshes
            </span>
            {opt.note && <p className="font-mono text-[10px] text-[var(--forge-muted)] italic">{opt.note}</p>}
            {(opt.regenerated?.length ?? 0) > 0 ? (
              <div className="flex flex-wrap gap-2">
                {opt.regenerated!.map((g) => (
                  <div key={g.newAssetId} className="w-20 h-20 rounded-lg overflow-hidden border border-[var(--ember-2)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/assets/${g.newAssetId}/raw`} alt={`Refresh for ${g.creativeId}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {(opt.optimizations ?? []).map((o) => (
                  <p key={o.creativeId} className="text-[10px] text-[var(--forge-muted)] leading-snug"><span className="text-[var(--forge-text)]">{o.name ?? o.creativeId}:</span> {o.brief}</p>
                ))}
              </div>
            )}
            {(opt.regenerated?.length ?? 0) > 0 && (
              <p className="font-mono text-[9px] text-[var(--forge-faint)] italic">New creatives are in your gallery — edit, then cast them.</p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
