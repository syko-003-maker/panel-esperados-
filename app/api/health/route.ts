import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  let dbOk = false;
  let dbError: string | null = null;

  try {
    // Check DB connection
    await prisma.$queryRaw`SELECT 1`;

    dbOk = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Unknown DB error";
  }

  const status = dbOk ? 200 : 503;

  return NextResponse.json(
    {
      ok: dbOk,
      db: dbOk,
      dbError: dbError,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
    },
    { status }
  );
}
