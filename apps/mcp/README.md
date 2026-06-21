# forgecast-mcp-server

An [MCP](https://modelcontextprotocol.io/) server that makes the Forgecast spine API agent-drivable. It wraps the Forgecast HTTP API so that any MCP-compatible AI client (Claude Desktop, Cursor, etc.) can create projects, generate images and video, start montage renders, publish assets, and inspect results without leaving the chat.

## Prerequisites

The **Forgecast web app must be running** before you use this server. By default it listens on `http://localhost:3210`. Set `FORGECAST_API_URL` if you use a different address.

```bash
# Start the web app first
pnpm -C apps/web dev
```

## MCP client configuration

Add this block to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "forgecast": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/forgecast/apps/mcp/src/index.ts"],
      "env": {
        "FORGECAST_API_URL": "http://localhost:3210"
      }
    }
  }
}
```

Replace `/absolute/path/to/forgecast` with the real path on your machine. `tsx` must be available (`npm i -g tsx`) or use `npx tsx` as shown above.

## Tools

| Tool | Description |
|------|-------------|
| `forgecast_health` | Check whether the spine API is reachable; lists configured providers |
| `forgecast_list_projects` | List all projects in the workspace |
| `forgecast_create_project` | Create a new project by name |
| `forgecast_generate_image` | Generate an image for a project (async job → polls until done, returns asset URL) |
| `forgecast_generate_short_video` | Start an async short-video job via MoneyPrinterTurbo; poll with `forgecast_get_job` |
| `forgecast_generate_video` | Start an async AI video job (fal.ai Veo3.1 / PixVerse); poll with `forgecast_get_job` |
| `forgecast_generate_montage` | Start an async montage render (Remotion); poll with `forgecast_get_job` |
| `forgecast_get_job` | Get the current status and progress of any job by ID |
| `forgecast_list_assets` | List all assets for a project, each with a direct download URL |
| `forgecast_publish_asset` | Publish an asset to a social platform (instagram, linkedin, youtube, omnisocials) |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGECAST_API_URL` | `http://localhost:3210` | Base URL of the Forgecast spine API |

All provider keys (`FAL_KEY`, `PIXVERSE_API_KEY`, social tokens, etc.) are set on the **web app** side, not here. The MCP server is a thin HTTP client.
