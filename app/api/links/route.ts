import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";

const DEFAULT_FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

// GET /api/links -> retourne toutes les liaisons (members)
export async function GET() {
  try {
    const links = await prisma.member.findMany({
      where: { familyId: DEFAULT_FAMILY_ID },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        discordId: true,
        steamId: true,
        rpName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(links, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("GET /api/links error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// POST /api/links -> crée ou met à jour une liaison via Discord OAuth
export async function POST(request: Request) {
  try {
    const session = await getSession();
    
    // Require authentication
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve Discord ID from NextAuth Account
    const discordAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "discord" },
      select: { providerAccountId: true },
    });

    if (!discordAccount?.providerAccountId) {
      return NextResponse.json(
        { error: "Discord account not linked to session" },
        { status: 400 }
      );
    }

    const discordId = discordAccount.providerAccountId;
    const body = await request.json();
    const steamId = body?.steamId;
    const rpName = body?.rpName;

    if (!steamId || typeof steamId !== "string") {
      return NextResponse.json({ error: "steamId is required" }, { status: 400 });
    }
    if (!rpName || typeof rpName !== "string") {
      return NextResponse.json({ error: "rpName is required" }, { status: 400 });
    }

    console.log("[POST /api/links] Linking member:", { discordId, steamId, rpName });

    // Upsert member with Discord ID from OAuth
    const link = await prisma.member.upsert({
      where: { familyId_discordId: { familyId: DEFAULT_FAMILY_ID, discordId } },
      create: { 
        familyId: DEFAULT_FAMILY_ID, 
        discordId, 
        steamId, 
        rpName,
        isActive: false, // ✅ Only LYG sync sets isActive=true
      },
      update: { 
        steamId, 
        rpName,
        // Ensure discordId is always set (in case of update)
        discordId,
        // ⚠️ Do NOT update isActive - preserve existing value
      },
    });

    console.log("[POST /api/links] Member linked successfully:", {
      id: link.id,
      discordId: link.discordId,
      steamId: link.steamId,
      rpName: link.rpName,
    });

    return NextResponse.json(link, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("POST /api/links error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
