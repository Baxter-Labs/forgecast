'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';

interface AgenticResult {
  videoJobIds?: string[];
  steps?: { tool: string; summary: string }[];
  summary?: string;
}

interface EditorAgentProps {
  projectId: string | null;
  /** Called with the run result so the workspace can hydrate the new arrangement + follow render jobs. */
  onDone: (result: AgenticResult) => void;
}

/**
 * The agent inside the video editor: describe the cut you want and it arranges
 * the same timeline document you're looking at (list_assets → set_timeline →
 * render_timeline), then the workspace hydrates its work live.
 */
export function EditorAgent({ projectId, onDone }: EditorAgentProps) {
  const [brief, setBrief] = useState('');
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ summary: string; steps: { tool: string; summary: string }[] } | null>(null);

  async function run() {
    const text = brief.trim();
    if (!text || !projectId || running) return;
    setRunning(true); setNotice(null); setLastRun(null);
    try {
      const res = await fetch('/api/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'agentic', brief: text, projectId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(body?.error ?? `Agent offline (${res.status})`);
        return;
      }
      const result = (body?.result ?? {}) as AgenticResult;
      setLastRun({ summary: result.summary ?? 'done', steps: result.steps ?? [] });
      setBrief('');
      onDone(result);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Network error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-3 flex items-center gap-1.5">
        <Sparkles size={11} aria-hidden="true" /> Agent
      </p>

      <label htmlFor="editor-agent-brief" className="sr-only">Tell the agent what to cut</label>
      <textarea
        id="editor-agent-brief"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run(); }}
        placeholder="e.g. Arrange my clips into a 15s vertical teaser — hero shot first, punchy captions, fade between clips — then render it."
        rows={3}
        disabled={running}
        className="w-full resize-none rounded-lg bg-[var(--forge-bg)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-xs leading-relaxed px-3 py-2 outline-none transition-all focus:border-[var(--ember-2)]"
      />
      <button
        type="button"
        onClick={() => void run()}
        disabled={running || !brief.trim() || !projectId}
        className={`btn-forge w-full rounded-lg py-2 mt-2 text-xs ${running ? 'forging' : ''}`}
      >
        {running ? '⚡ ARRANGING…' : '⚡ LET THE AGENT CUT IT'}
      </button>

      {notice && (
        <p role="alert" className="font-mono text-[10px] text-red-300 mt-2 leading-relaxed">{notice}</p>
      )}

      {lastRun && (
        <div className="mt-3 rounded-lg border p-2.5 flex flex-col gap-1.5" style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-bg)' }}>
          {lastRun.steps.map((s, i) => (
            <p key={i} className="font-mono text-[10px] text-[var(--forge-faint)] truncate">
              <span className="text-[var(--ember-1)] opacity-80">{s.tool}</span> · {s.summary}
            </p>
          ))}
          <p className="font-mono text-[10px] text-[var(--forge-muted)] leading-relaxed">{lastRun.summary}</p>
        </div>
      )}

      <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-2 leading-relaxed">
        the agent edits this same timeline — its cut appears here when it finishes
      </p>
    </div>
  );
}
