# Vapi Voice Assistant Setup

This document describes how to configure a Vapi assistant to drive Forgecast by voice.

## System Prompt

```
You are Forgecast's voice content studio. You help the user plan and create social media content using AI-generated images and videos. You can create new content campaigns, check the status of rendering jobs, and list existing projects. Always confirm what you are about to do before running long operations. Keep your responses concise and friendly.
```

## Server URL

Set the assistant's server URL to:

```
<public Forgecast URL>/api/voice/vapi
```

For local development, expose the Forgecast app publicly using a Cloudflare Tunnel (or similar) so Vapi can reach the webhook:

```bash
cloudflared tunnel --url http://localhost:3210
```

## Custom Tools (Vapi `function` definitions)

Add these three tools to the Vapi assistant under **Tools → Custom**.

### `create_content`

```json
{
  "name": "create_content",
  "description": "Plan and generate a content campaign (images, videos) and optionally publish to social platforms.",
  "parameters": {
    "type": "object",
    "properties": {
      "brief": {
        "type": "string",
        "description": "A short description of the content to create, e.g. 'eco-friendly sneakers launch for Gen Z'."
      },
      "platforms": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Target social platforms, e.g. ['instagram', 'tiktok']. Defaults to ['instagram']."
      },
      "publish": {
        "type": "boolean",
        "description": "If true, publish the generated assets to the specified platforms immediately."
      }
    },
    "required": ["brief"]
  }
}
```

### `check_job`

```json
{
  "name": "check_job",
  "description": "Check the status and progress of a background rendering job (image or video).",
  "parameters": {
    "type": "object",
    "properties": {
      "jobId": {
        "type": "string",
        "description": "The job ID returned when content was created."
      }
    },
    "required": ["jobId"]
  }
}
```

### `list_projects`

```json
{
  "name": "list_projects",
  "description": "List all Forgecast projects belonging to this workspace.",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
```

## Required Environment Variables

| Variable | Purpose |
|---|---|
| `VAPI_WEBHOOK_SECRET` | **Required.** Shared secret — the webhook is disabled (503) until it's set. Configure the SAME value as your Vapi assistant's server secret so Vapi sends it as the `x-vapi-secret` header; requests without the matching header are rejected (401). |
| `OPENAI_API_KEY` | Required for the content agent to generate campaign plans. |
| `FAL_KEY` | Required for AI image generation via fal.ai. |
| `FORGECAST_BASE_URL` | Public URL of the Forgecast app (used for asset URLs). |
| `VAPI_OWNER` | Optional — on a multi-user deploy, scope the assistant to one user's workspace (by user id). Defaults to the local operator. |

Without `VAPI_WEBHOOK_SECRET` the webhook is **disabled** (503). Without `OPENAI_API_KEY`, `create_content` returns a friendly "not configured" message instead of running.

## Notes

- The Forgecast app **must be publicly reachable** when Vapi calls the webhook. Use Cloudflare Tunnel (`cloudflared`) in local development.
- Provider keys (`FAL_KEY`, etc.) must be set in the same environment that runs the Forgecast Next.js server.
- Video renders are asynchronous — use `check_job` with the returned job IDs to poll for completion.
