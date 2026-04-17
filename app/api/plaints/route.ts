import { NextResponse } from 'next/server';

// Route legacy — désactivée. Utiliser /api/staff/complaints à la place.
export async function GET() {
  return NextResponse.json({ error: 'Route désactivée' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Route désactivée' }, { status: 404 });
}
