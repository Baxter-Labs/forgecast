'use client';
import { useState, type ReactNode } from 'react';

function CopyButton({ text, label = 'copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — the value stays visible to copy manually */
        }
      }}
      className="shrink-0 font-mono text-[11px] px-2.5 py-1 rounded-md border border-[var(--forge-border)] text-[var(--ember-1)] transition-colors hover:border-[var(--ember-2)]"
    >
      {copied ? 'copied ✓' : label}
    </button>
  );
}

function CodeBlock({ text }: { text: string }) {
  return (
    <div className="relative rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)]">
      <pre className="overflow-x-auto p-4 pr-16 font-mono text-xs leading-relaxed text-[var(--forge-text)]"><code>{text}</code></pre>
      <div className="absolute top-2.5 right-2.5"><CopyButton text={text} /></div>
    </div>
  );
}

function Field({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [show, setShow] = useState(!secret);
  const shown = show ? value : '•'.repeat(Math.min(44, Math.max(12, value.length)));
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--forge-faint)] mb-1.5">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-xs text-[var(--forge-text)] bg-[var(--forge-surface-2)] border border-[var(--forge-border)] rounded-md px-3 py-2 truncate">{shown}</code>
        {secret && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="shrink-0 font-mono text-[11px] px-2.5 py-1 rounded-md border border-[var(--forge-border)] text-[var(--forge-muted)] transition-colors hover:border-[var(--ember-2)]"
          >
            {show ? 'hide' : 'reveal'}
          </button>
        )}
        <CopyButton text={value} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="font-outfit font-semibold text-lg text-[var(--forge-text)] mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function ConnectMcp({ mcpUrl, token, authEnabled }: { mcpUrl: string; token: string; authEnabled: boolean }) {
  const headerFlag = authEnabled ? ` --header "Authorization: Bearer ${token}"` : '';
  const claudeCode = `claude mcp add --transport http forgecast ${mcpUrl}${headerFlag}`;
  const json = JSON.stringify(
    { mcpServers: { forgecast: { url: mcpUrl, ...(authEnabled ? { headers: { Authorization: `Bearer ${token}` } } : {}) } } },
    null,
    2,
  );

  return (
    <main className="min-h-screen px-6 py-10" style={{ background: 'var(--forge-bg)', color: 'var(--forge-text)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">Connect your AI</h1>
            <p className="font-mono text-xs tracking-widest text-[var(--forge-muted)] uppercase mt-1">drive the forge from Claude or ChatGPT</p>
          </div>
          <a href="/" className="font-mono text-xs text-[var(--ember-1)] hover:underline">← back to Studio</a>
        </div>

        <p className="text-[var(--forge-muted)] leading-relaxed mb-8">
          Connect Forgecast to the AI you already use — Claude, ChatGPT, or Cursor. Your assistant can then
          create projects, generate images and video, and track jobs on your behalf, over the Model Context
          Protocol (MCP). It runs on your own AI, so there&apos;s no extra cost.
        </p>

        <div className="panel p-5 mb-8 space-y-4">
          <Field label="MCP server URL" value={mcpUrl} />
          {authEnabled ? (
            <Field label="Your access token" value={token} secret />
          ) : (
            <p className="font-mono text-[11px] text-[var(--forge-faint)]">Self-host mode — no token needed; the endpoint runs as the local operator.</p>
          )}
        </div>

        <Section title="Claude Code (CLI)">
          <CodeBlock text={claudeCode} />
        </Section>

        <Section title="Claude Desktop · Cursor · ChatGPT (config)">
          <p className="text-sm text-[var(--forge-muted)] mb-3">
            Add this to your MCP config (e.g. Cursor&apos;s <code className="text-[var(--ember-1)]">~/.cursor/mcp.json</code>, or your client&apos;s
            custom-connector settings), then reload.
          </p>
          <CodeBlock text={json} />
        </Section>

        {authEnabled && (
          <p className="font-mono text-[11px] text-[var(--forge-faint)] mt-8 leading-relaxed">
            Treat this token like a password — it grants access to your Forgecast workspace, and is valid for one
            year. To revoke it, an operator can rotate the server&apos;s <code>AUTH_SECRET</code> (per-token revocation is coming).
          </p>
        )}
      </div>
    </main>
  );
}
