import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { requireStaffAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";

const DEFAULT_FAMILY_SLUG = process.env.FAMILY_ID ?? "esperados";

// GET /api/links -> retourne toutes les liaisons (members)
// ⚠️ SÉCURITÉ : expose discordId + steamId + rpName de TOUS les membres
// (cartographie d'identités). Réservé au staff.
export async function GET() {
  const guard = await requireStaffAccess();
  if (guard instanceof Response) return guard;

  try {
    const links = await prisma.member.findMany({
      where: { familyId: await resolveFamilyId(DEFAULT_FAMILY_SLUG) },
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
    const familyId = await resolveFamilyId(DEFAULT_FAMILY_SLUG);
    const body = await request.json();
    const steamId = body?.steamId;
    const rpName = body?.rpName;

    if (!steamId || typeof steamId !== "string") {
      return NextResponse.json({ error: "steamId is required" }, { status: 400 });
    }
    if (!rpName || typeof rpName !== "string") {
      return NextResponse.json({ error: "rpName is required" }, { status: 400 });
    }


    const existingByDiscord = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId, discordId } },
      select: { id: true, steamId: true, discordId: true },
    });

    const existingBySteam = await prisma.member.findFirst({
      where: { familyId, steamId },
      select: { id: true, steamId: true, discordId: true, rpName: true },
    });

    if (existingByDiscord?.steamId && existingByDiscord.steamId !== steamId) {
      return NextResponse.json({ error: "TARGET_ALREADY_LINKED" }, { status: 403 });
    }

    if (existingBySteam?.discordId && existingBySteam.discordId !== discordId) {
      return NextResponse.json({ error: "STEAM_ALREADY_LINKED" }, { status: 403 });
    }

    let link: Awaited<ReturnType<typeof prisma.member.update>> | Awaited<ReturnType<typeof prisma.member.upsert>> | null = null;

    if (existingBySteam) {
      if (existingByDiscord && existingByDiscord.id !== existingBySteam.id) {
        await prisma.$transaction(async (tx) => {
          await tx.member.update({
            where: { id: existingByDiscord.id },
            data: {
              debugPrevDiscordId: discordId,
              discordId: null,
            },
          });

          link = await tx.member.update({
            where: { id: existingBySteam.id },
            data: {
              discordId,
              steamId,
              rpName,
            },
          });
        });
      } else {
        link = await prisma.member.update({
          where: { id: existingBySteam.id },
          data: {
            discordId,
            steamId,
            rpName,
          },
        });
      }
    } else {
      // Upsert member with Discord ID from OAuth
      link = await prisma.member.upsert({
        where: { familyId_discordId: { familyId, discordId } },
        create: { 
          familyId, 
          discordId, 
          steamId, 
          rpName,
          isActive: false, // ✅ Only LYG sync sets isActive=true
        },
        update: { 
          steamId, 
          rpName,
          discordId,
        },
      });
    }

    if (!link) {
      return NextResponse.json({ error: "LINK_FAILED" }, { status: 500 });
    }


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
