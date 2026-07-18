import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { deleteBrainstormBoard } from '@/lib/api';
import { requireProject } from '@/lib/auth-guard';

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; boardId: string }> }) {
  const { id, boardId } = await ctx.params;
  const guard = await requireProject(getServices(), req.headers.get('cookie'), id);
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const services = await getServicesForUser(guard.userId);
  const r = await deleteBrainstormBoard(services, id, boardId);
  return NextResponse.json(r.body, { status: r.status });
}
