import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { authConfig, userFromBearer } from '@/lib/auth';
import { handleMcpMessage, type JsonRpcMessage } from '@/lib/mcp';

// Remote MCP endpoint (JSON-RPC over HTTP). A Claude / ChatGPT / Cursor client connects
// to this URL with the user's Forgecast MCP token as a Bearer token. In open self-host
// mode (auth off) it runs as the local operator.
export async function POST(req: Request) {
  const cfg = authConfig();
  let userId = 'local';
  if (cfg) {
    const user = await userFromBearer(getServices(), cfg, req.headers.get('authorization'));
    if (!user) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'unauthorized — connect with your Forgecast MCP token as a Bearer token' } },
        { status: 401 },
      );
    }
    userId = user.id;
  }
  const services = cfg ? await getServicesForUser(userId) : getServices();

  const msg = (await req.json().catch(() => null)) as JsonRpcMessage | null;
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, { status: 200 });
  }

  const result = await handleMcpMessage({ services, userId }, msg);
  if (result === null) return new NextResponse(null, { status: 202 }); // notification — no body
  return NextResponse.json(result.body, { status: result.status });
}

// The Streamable-HTTP optional GET stream isn't offered (no server-initiated messages);
// clients fall back to POST-only, which serves every request/response.
export function GET() {
  return NextResponse.json({ error: 'use POST (JSON-RPC 2.0); this MCP server has no GET stream' }, { status: 405 });
}
