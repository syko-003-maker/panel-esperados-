import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({ ok: true, where: "app/api/ping/route.ts" });
}
