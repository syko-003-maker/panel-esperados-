import { NextResponse } from "next/server";

/**
 * @deprecated Use POST /api/ingest/tickets instead
 * This endpoint is no longer active and returns 410 Gone
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "DEPRECATED",
      message: "This endpoint is deprecated. Use POST /api/ingest/tickets with type='complaint.create' instead.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "DEPRECATED",
      message: "This endpoint is deprecated. Use POST /api/ingest/tickets instead.",
    },
    { status: 410 }
  );
}
