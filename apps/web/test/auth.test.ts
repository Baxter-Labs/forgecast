import { describe, it, expect, vi } from 'vitest';
import { verifySession } from '@forgecast/core';
import { buildServices } from '../lib/forgecast';
import {
  authConfig, pkceChallenge, googleAuthUrl, exchangeCode, fetchGoogleUser,
  startGoogleAuth, completeGoogleAuth, sessionUser, cookieValue,
  SESSION_COOKIE, OAUTH_COOKIE, type AuthConfig,
} from '../lib/auth';

const CFG: AuthConfig = {
  clientId: 'client-123.apps.googleusercontent.com',
  clientSecret: 'shhh',
  secret: 'session-secret-32-bytes-minimum!!',
  baseUrl: 'https://forge.example.com',
};

describe('authConfig', () => {
  it('is null unless client id + secret + AUTH_SECRET are all set', () => {
    expect(authConfig({})).toBeNull();
    expect(authConfig({ GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y' })).toBeNull();
    const cfg = authConfig({ GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', AUTH_SECRET: 'z', FORGECAST_BASE_URL: 'https://a.b/' });
    expect(cfg).toEqual({ clientId: 'x', clientSecret: 'y', secret: 'z', baseUrl: 'https://a.b' });
  });
});

describe('PKCE + auth URL', () => {
  it('computes the RFC 7636 S256 example challenge', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('builds the Google consent URL with redirect back to /api/auth/callback', () => {
    const url = new URL(googleAuthUrl(CFG, 'state-1', 'challenge-1'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CFG.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe('https://forge.example.com/api/auth/callback');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });
});

describe('Google exchanges', () => {
  it('exchangeCode posts the form-encoded grant and returns the access token', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body);
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=code-1');
      expect(body).toContain('code_verifier=ver-1');
      return new Response(JSON.stringify({ access_token: 'at-1' }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await exchangeCode(fetchFn, CFG, 'code-1', 'ver-1')).toBe('at-1');
  });

  it('exchangeCode returns null on a non-200', async () => {
    const fetchFn = (async () => new Response('{}', { status: 400 })) as typeof fetch;
    expect(await exchangeCode(fetchFn, CFG, 'bad', 'v')).toBeNull();
  });

  it('fetchGoogleUser sends the bearer token and parses the profile', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer at-1');
      return new Response(JSON.stringify({ email: 'S@Ex.com', name: 'Smith', picture: 'https://img/p.png' }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchGoogleUser(fetchFn, 'at-1')).toEqual({ email: 'S@Ex.com', name: 'Smith', picture: 'https://img/p.png' });
  });
});

describe('full flow', () => {
  function googleMock() {
    return (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'at-9' }), { status: 200 });
      }
      if (u.includes('openidconnect.googleapis.com/v1/userinfo')) {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer at-9');
        return new Response(JSON.stringify({ email: 'smith@example.com', name: 'Smith' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
  }

  it('startGoogleAuth stores state.verifier in the cookie that matches the consent URL', async () => {
    const { location, setCookie } = await startGoogleAuth(CFG);
    const url = new URL(location);
    const stored = cookieValue(setCookie.split(';')[0], OAUTH_COOKIE)!;
    const [state, verifier] = [stored.slice(0, stored.indexOf('.')), stored.slice(stored.indexOf('.') + 1)];
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('code_challenge')).toBe(await pkceChallenge(verifier));
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure'); // https base URL
  });

  it('completeGoogleAuth upserts the user and issues a verifiable session cookie', async () => {
    const services = buildServices({ fetchFn: googleMock() });
    const url = new URL('https://forge.example.com/api/auth/callback?code=code-9&state=st-1');
    const result = await completeGoogleAuth(services, CFG, url, `${OAUTH_COOKIE}=st-1.ver-9`);
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    expect(result.user.email).toBe('smith@example.com');
    expect(await services.users.getByEmail('smith@example.com')).not.toBeNull();

    const token = cookieValue(result.setCookie.split(';')[0], SESSION_COOKIE)!;
    const payload = await verifySession(token, CFG.secret, Math.floor(Date.now() / 1000));
    expect(payload?.uid).toBe(result.user.id);
  });

  it('rejects a state mismatch and a missing state cookie', async () => {
    const services = buildServices({ fetchFn: googleMock() });
    const url = new URL('https://forge.example.com/api/auth/callback?code=c&state=EVIL');
    expect((await completeGoogleAuth(services, CFG, url, `${OAUTH_COOKIE}=st-1.ver-9`)).ok).toBe(false);
    expect((await completeGoogleAuth(services, CFG, url, null)).ok).toBe(false);
  });

  it('sessionUser resolves the signed-in user and rejects junk', async () => {
    const services = buildServices({ fetchFn: googleMock() });
    const url = new URL('https://forge.example.com/api/auth/callback?code=code-9&state=st-1');
    const result = await completeGoogleAuth(services, CFG, url, `${OAUTH_COOKIE}=st-1.ver-9`);
    if (!result.ok) throw new Error('setup failed');
    const cookie = result.setCookie.split(';')[0];

    expect((await sessionUser(services, CFG, cookie))?.email).toBe('smith@example.com');
    expect(await sessionUser(services, CFG, `${SESSION_COOKIE}=garbage.token`)).toBeNull();
    expect(await sessionUser(services, CFG, null)).toBeNull();
    expect(await sessionUser(services, null, cookie)).toBeNull(); // auth disabled
  });
});
