import { NextResponse } from 'next/server';

// This route is deprecated - Ticket model does not exist
export async function GET() {
  return NextResponse.json({ error: 'Route deprecated' }, { status: 410 });
}
