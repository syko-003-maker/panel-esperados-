import { NextResponse } from "next/server";

// This route is deprecated - Ticket/TicketMessage models removed
export async function GET() {
  return NextResponse.json({ error: "Route deprecated" }, { status: 410 });
}
