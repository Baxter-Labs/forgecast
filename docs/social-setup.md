# Social Platform Setup Guide

Forgecast supports publishing to Instagram, LinkedIn, and YouTube via native adapters, plus 10+ platforms via the OmniSocials aggregator. Each adapter self-gates: if credentials are missing, it reports unavailable instead of crashing.

**What's testable now:** All adapters are mock-tested (injectable `fetchFn`, no network). Live posting requires approved apps + real access tokens on each platform.

---

## OmniSocials (fastest path)

One API key covers TikTok, Instagram, Twitter/X, Facebook, LinkedIn, YouTube, and more.

1. Sign up at [omnisocials.com](https://omnisocials.com) and connect your social accounts.
2. Copy your API key.
3. Set `OMNISOCIALS_API_KEY=<your-key>` in `.env`.

---

## Instagram (Graph API)

### Prerequisites
- A **Facebook Page** connected to an **Instagram Business** or **Creator** account.
- A **Meta Developer App** ([developers.facebook.com](https://developers.facebook.com)).

### Required Permissions (App Review)
- `instagram_content_publish` — post photos and reels
- `pages_read_engagement` — read the connected Page
- `instagram_basic` — read IG account info

### Steps
1. Create a Meta App at [developers.facebook.com/apps](https://developers.facebook.com/apps) (type: Business).
2. Add the **Instagram Graph API** product.
3. In **App Review**, submit the three permissions above for review. Meta reviews typically take 1-5 business days.
4. While waiting, use the **Graph API Explorer** to generate a short-lived token for testing:
   - Select your app, select the Page, grant all permissions, and click **Generate Access Token**.
   - Exchange for a long-lived token: `GET /oauth/access_token?grant_type=fb_exchange_token&client_id={app-id}&client_secret={app-secret}&fb_exchange_token={short-lived-token}`
5. Get your IG User ID: `GET /me/accounts` (find the Page), then `GET /{page-id}?fields=instagram_business_account` to get the IG user ID.
6. Set in `.env`:
   ```
   INSTAGRAM_ACCESS_TOKEN=<long-lived-token>
   INSTAGRAM_IG_USER_ID=<ig-user-id>
   ```

### How Forgecast Uses It
- **Images**: creates a media container with `image_url`, then publishes it.
- **Videos**: creates a container with `video_url` + `media_type=REELS`, then publishes. The video must be publicly accessible by Instagram's servers.

---

## LinkedIn (Posts API)

### Prerequisites
- A **LinkedIn Developer App** ([linkedin.com/developers](https://www.linkedin.com/developers/)).
- For personal posts: `w_member_social` scope.
- For organization/company posts: `w_organization_social` scope + Marketing Developer Platform access.

### Steps
1. Create an app at [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps).
2. Under **Auth**, add the OAuth 2.0 redirect URL and note the Client ID + Secret.
3. Request access to the **Share on LinkedIn** product (grants `w_member_social`).
4. Generate an access token via the OAuth 2.0 flow:
   ```
   https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id={client-id}&redirect_uri={redirect}&scope=openid%20profile%20w_member_social
   ```
   Exchange the auth code for a token via `POST /oauth/v2/accessToken`.
5. Get your author URN:
   - Personal: `GET /v2/userinfo` -> use `sub` field as `urn:li:person:{sub}`
   - Organization: `urn:li:organization:{org-id}` (from the company admin page URL)
6. Set in `.env`:
   ```
   LINKEDIN_ACCESS_TOKEN=<token>
   LINKEDIN_AUTHOR_URN=urn:li:person:xxxx
   ```

### How Forgecast Uses It
- Creates a text post via `POST /rest/posts`. Media upload (images/videos) requires the multi-step register/upload/attach flow — text posts are supported first; rich media is a follow-up.

---

## YouTube (Data API v3)

### Prerequisites
- A **Google Cloud project** with the YouTube Data API v3 enabled.
- OAuth consent screen configured for your domain.

### Required Scopes
- `https://www.googleapis.com/auth/youtube.upload` — upload videos (sensitive scope, requires Google verification for production)

### Steps
1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project.
2. Enable **YouTube Data API v3** under APIs & Services.
3. Configure the **OAuth consent screen** (External or Internal for Workspace orgs).
4. Create **OAuth 2.0 credentials** (type: Web application). Add your redirect URI.
5. For testing, use the **OAuth Playground** ([developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)):
   - Select `YouTube Data API v3 > youtube.upload`.
   - Authorize and exchange for an access token.
6. Set in `.env`:
   ```
   YOUTUBE_ACCESS_TOKEN=<token>
   ```

### Google Verification
For production use (>100 users or using sensitive scopes like `youtube.upload`), Google requires app verification. This includes a privacy policy URL, domain ownership, and a review process that takes 2-6 weeks.

### How Forgecast Uses It
- Fetches the video bytes from the asset's public URL.
- Initiates a resumable upload: `POST /upload/youtube/v3/videos?uploadType=resumable` with metadata (title derived from first line of caption, truncated to 70 chars; privacy defaults to `unlisted`).
- Uploads the bytes to the returned location URL.

---

## FORGECAST_BASE_URL

For any publisher that needs to fetch your media (Instagram, YouTube), the Forgecast app must be reachable from the internet. Set `FORGECAST_BASE_URL` to your public URL (e.g. via Cloudflare Tunnel, ngrok, or a deployed instance):

```
FORGECAST_BASE_URL=https://your-forgecast.example.com
```

Without this, `mediaUrls` in the publish request will be empty and platforms that require media will fail.
