import { NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Use the discord worker script (npm run discord:worker)." },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function POST(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  return NextResponse.json(
    { ok: false, error: "Use the discord worker script (npm run discord:worker)." },
    { status: 501 }
  );
}
