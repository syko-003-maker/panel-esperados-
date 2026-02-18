import { NextResponse } from "next/server";

export async function GET() {
  const res = await fetch("https://api.lyg.fr/api/familles/esperados/infos", {
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "LYG infos error" }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
