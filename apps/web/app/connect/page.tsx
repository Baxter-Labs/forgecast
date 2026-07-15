import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getServices } from '@/lib/forgecast';
import { authConfig, sessionUser, mintApiToken } from '@/lib/auth';
import { ConnectMcp } from '@/components/ConnectMcp';

export const metadata = { title: 'Forgecast — Connect your AI' };

// Mints a per-user token at request time; never prerender.
export const dynamic = 'force-dynamic';

export default async function ConnectPage() {
  const cfg = authConfig();
  const cookieHeader = (await cookies()).toString();

  let token = '';
  if (cfg) {
    const user = await sessionUser(getServices(), cfg, cookieHeader);
    if (!user) redirect('/signin');
    token = await mintApiToken(cfg, user.id);
  }

  const baseUrl = (process.env.FORGECAST_BASE_URL ?? '').replace(/\/+$/, '');
  const mcpUrl = `${baseUrl}/api/mcp`;
  return <ConnectMcp mcpUrl={mcpUrl} token={token} authEnabled={Boolean(cfg)} />;
}
