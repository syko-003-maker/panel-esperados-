import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, DEFAULT_FAMILY_NAME } from "@/lib/family";

export async function POST() {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // Check if user is chef (admin)
  const user = await prisma.user.findFirst({
    where: { email: session.user.email },
    select: { isChef: true },
  });

  if (!user?.isChef) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    // Upsert Family using centralized config
    await prisma.family.upsert({
      where: { slug: DEFAULT_FAMILY_ID },
      create: { slug: DEFAULT_FAMILY_ID, name: DEFAULT_FAMILY_NAME },
      update: { name: DEFAULT_FAMILY_NAME },
    });

    return NextResponse.json({ ok: true, message: `Family ${DEFAULT_FAMILY_ID} created/updated` });
  } catch (e) {
    console.error("Bootstrap error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
