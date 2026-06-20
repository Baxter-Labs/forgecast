# Agent-Reach Trend Intelligence Setup

Forgecast's content agent can pull live trend data from Agent-Reach before planning content.
When enabled, the agent fetches what's trending on the target platform and folds that context
into the content plan. Without it the agent still works — it just plans without live trend data.

Zero API fees: Agent-Reach uses free backends + browser cookies (no paid API keys required).

Source: https://github.com/Panniantong/Agent-Reach (MIT licence)

---

## Installation

```bash
pip install agent-reach
```

Verify the installation and check which platforms are ready:

```bash
agent-reach doctor
```

---

## Cookie login (Twitter / Instagram)

Some platforms (Twitter/X, Instagram, LinkedIn, Xiaohongshu) require you to be logged in via
saved browser cookies. After installing, run the platform-specific login helper:

```bash
agent-reach login twitter
agent-reach login instagram
```

Follow the prompts to open the browser and capture your session. Re-run `agent-reach doctor`
afterwards to confirm the platform shows as healthy.

Platforms that need no login: reddit, youtube, github, web, bilibili.

---

## Enable in Forgecast

Set one environment variable to activate trend enrichment:

```bash
AGENT_REACH_ENABLED=1
```

If the `agent-reach` binary is not on your PATH (e.g. installed into a virtual-env), also set:

```bash
AGENT_REACH_BIN=/path/to/venv/bin/agent-reach
```

In development add these to your `.env.local`; in production add them to your Vercel project
environment variables.

---

## Supported platforms

| Alias passed to the agent | Agent-Reach sub-command |
|---------------------------|-------------------------|
| twitter, x                | search-twitter          |
| reddit                    | search-reddit           |
| youtube, yt               | search-youtube          |
| github                    | search-github           |
| linkedin                  | search-linkedin         |
| instagram, ig             | search-instagram        |
| bilibili                  | search-bilibili         |
| xiaohongshu               | search-xiaohongshu      |
| web                       | search-web              |

---

## Behaviour when Agent-Reach is not installed

If `AGENT_REACH_ENABLED` is not set, `maybeTrendTool()` returns `undefined` and the
`ContentAgent` plans content without trend context — no errors, no degraded output.

If `AGENT_REACH_ENABLED` is set but the binary is missing or returns a non-zero exit code,
`AgentReachTrendTool.trending()` returns an empty string and the agent continues normally.
