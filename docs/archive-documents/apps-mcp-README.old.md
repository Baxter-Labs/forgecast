# forgecast-mcp-server

An [MCP](https://modelcontextprotocol.io/) server that makes the Forgecast spine API agent-drivable. It wraps the Forgecast HTTP API so that any MCP-compatible AI client (Claude Desktop, Cursor, etc.) can create projects, generate images, start video jobs, and inspect results without leaving the chat.

## Prerequisites

The **Forgecast web app must be running** before you use this server. By default it listens on `http://localhost:3210`. Set `FORGECAST_API_URL` if you use a different address.

## MCP client configuration

Add this block to your MCP client's config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "forgecast": {
      "command": "tsx",
      "args": ["/absolute/path/to/forgecast/apps/mcp/src/index.ts"],
      "env": {
        "FORGECAST_API_URL": "http://localhost:3210"
      }
    }
  }
}
```

Replace `/absolute/path/to/forgecast` with the real path on your machine.

> **Tip:** `tsx` must be available globally (`npm i -g tsx`) or you can use `npx tsx` instead.

## Tools

| Tool | Description |
|------|-------------|
| `forgecast_health` | Check whether the spine API is reachable; lists configured image providers |
| `forgecast_list_projects` | List all projects in the workspace |
| `forgecast_create_project` | Create a new project by name |
| `forgecast_generate_image` | Generate an image for a project (synchronous; returns asset URL) |
| `forgecast_generate_short_video` | Start an async short-video job; poll `forgecast_get_job` for progress |
| `forgecast_get_job` | Get current status/progress of a job by ID |
| `forgecast_list_assets` | List all assets for a project, each with a direct download URL |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGECAST_API_URL` | `http://localhost:3210` | Base URL of the Forgecast spine API |
