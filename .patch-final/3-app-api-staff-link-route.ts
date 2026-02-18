import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { getDiscordIdFromSessionOrAccount } from "@/lib/me";

/**
 * ✅ PATCH: Endpoint /api/staff/link IDEMPOTENT
 * - Si déjà lié -> redirect /me (ou JSON alreadyLinked:true)
 * - Sinon -> upsert member + redirect /me
 * - Logs DEBUG complets
 */
export async function POST(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const userId = session?.user?.id;

  // ✅ LOG DEBUG
  console.log("[link] start userId:", userId);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // ✅ Source unique
  const discordId = await getDiscordIdFromSessionOrAccount(session);
  
  // ✅ LOG DEBUG
  console.log("[link] discordId:", discordId);

  if (!discordId) {
    console.error("[link] No Discord account found for userId:", userId);
    return NextResponse.json({ ok: false, error: "NO_DISCORD_ACCOUNT" }, { status: 403 });
  }

  const familyId = "esperados";

  // ✅ IDEMPOTENCE: Vérifier si déjà lié
  const existingMember = await prisma.member.findUnique({
    where: { familyId_discordId: { familyId, discordId } },
    select: { id: true, steamId: true, discordId: true },
  });

  if (existingMember && existingMember.steamId) {
    // ✅ LOG DEBUG
    console.log("[link] already linked memberId:", existingMember.id, "-> redirect /me");
    
    // Si requête HTML -> redirect, sinon JSON
    const acceptHeader = req.headers.get("accept") ?? "";
    if (acceptHeader.includes("text/html")) {
      return NextResponse.redirect(new URL("/me", req.url));
    }
    return NextResponse.json({
      ok: true,
      alreadyLinked: true,
      member: { id: existingMember.id, discordId: existingMember.discordId },
    });
  }

  // ✅ LOG DEBUG
  console.log("[link] not linked yet, proceeding with link");

  // ✅ Accept JSON OR formData
  const contentType = req.headers.get("content-type") ?? "";
  let data: Record<string, any> = {};

  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => ({}));
    data = json && typeof json === "object" ? (json as any) : {};
  } else {
    const formData = await req.formData();
    data = Object.fromEntries(formData.entries());
  }

  const steamId = String(data.steamId ?? "").trim();
  const rpNameRaw = String(data.rpName ?? "").trim();
  const ageRaw = String(data.age ?? "").trim();
  const redirectTo = String(data.redirectTo ?? "").trim();

  // Check if request is from browser (Accept: text/html)
  const acceptHeader = req.headers.get("accept") ?? "";
  const wantHtml = acceptHeader.includes("text/html");

  if (!steamId) {
    return NextResponse.json({ ok: false, error: "MISSING_STEAM_ID" }, { status: 400 });
  }

  // ⚠️ VERIF: Si discordId ressemble à un SteamID (sécurité)
  if (discordId.match(/^7656119\d{10}$/)) {
    console.warn(
      "[link] WARNING: discordId looks like a SteamID!",
      "discordId:",
      discordId,
      "steamId:",
      steamId
    );
  }

  let age: number | null = null;
  if (ageRaw) {
    const parsed = Number(ageRaw);
    if (!Number.isInteger(parsed)) {
      return NextResponse.json({ ok: false, error: "INVALID_AGE" }, { status: 400 });
    }
    age = parsed;
  }

  const rpName = rpNameRaw ? rpNameRaw : null;

  // Ensure Family exists before upserting Member (FK constraint)
  await prisma.family.upsert({
    where: { id: familyId },
    create: { id: familyId, name: familyId },
    update: {},
  });

  // ✅ UPSERT avec discordId comme clé
  const member = await prisma.member.upsert({
    where: { familyId_discordId: { familyId, discordId } },
    create: { familyId, discordId, steamId, rpName, age },
    update: { steamId, rpName, age, discordId }, // ← Garantir discordId
  });

  // ✅ LOG DEBUG
  console.log(
    "[link] upserted memberId:",
    member.id,
    "discordId:",
    member.discordId,
    "steamId:",
    member.steamId
  );

  // If browser request, redirect to panel instead of JSON
  if (wantHtml) {
    const destination = redirectTo || "/me";
    return NextResponse.redirect(new URL(destination, req.url));
  }

  return NextResponse.json({ ok: true, member: { id: member.id, discordId: member.discordId } });
}
