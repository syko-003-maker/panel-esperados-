import { NextResponse } from 'next/server';

// This route is deprecated - Ticket model does not exist
// Use /api/staff/recruitments or /api/staff/complaints instead
export async function POST(req: Request) {
  return NextResponse.json({ error: 'Route deprecated' }, { status: 410 });
}

