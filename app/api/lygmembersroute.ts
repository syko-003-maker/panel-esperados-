import { NextResponse } from "next/server";
import { lygFetchMembers } from "@/lib/lyg-client";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export async function GET() {
  const result = await lygFetchMembers(DEFAULT_FAMILY_ID, { timeoutMs: 15_000 });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "LYG members error" }, { status: result.status || 500 });
  }

  return NextResponse.json(result.data ?? []);
}
