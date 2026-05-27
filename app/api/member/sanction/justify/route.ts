import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { getUserRole } from "@/server/auth/rbac";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { postDiscordMessage } from "@/server/worker/post-discord";
import { enforceRateLimit } from "@/server/rate-limit";

const DISCORD_CHANNEL_ID = "1409028569203740792";

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getUserRole(session);
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if member is linked
    const linkedMember = await getMemberScopeOrNull(session);
    if (!linkedMember) {
      return NextResponse.json(
        { code: "MEMBER_NOT_LINKED" },
        { status: 403 }
      );
    }

    // Parse body. Le client envoie maintenant `sanctionType` (Warn / Jail /
    // Ban). On garde `sanctionId` en alias pour rétro-compat (anciens clients
    // qui auraient encore le champ libre). `sanctionType` a la priorité.
    const body = await req.json();
    const { sanctionId, sanctionType, reason, context } = body ?? {};
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    const trimmedContext = typeof context === "string" ? context.trim() : "";
    const rawType =
      typeof sanctionType === "string" && sanctionType.trim()
        ? sanctionType.trim()
        : typeof sanctionId === "string"
          ? sanctionId.trim()
          : "";
    // Normalisation : on accepte Warn/Jail/Ban (case-insensitive) pour
    // l'affichage propre, mais on n'impose pas (compat : un membre peut
    // toujours envoyer un type custom textuel s'il y arrive).
    const trimmedSanctionType = rawType;

    if (!trimmedReason || trimmedReason.length < 10) {
      return NextResponse.json(
        { error: "reason must be at least 10 characters" },
        { status: 400 }
      );
    }

    const discordId = linkedMember.discordId;
    const member = { id: linkedMember.memberId, rpName: linkedMember.rpName };

    // Rate limit (3 per 10 minutes)
    const rate = await enforceRateLimit({
      discordId: discordId || "",
      key: "member:sanction-justify",
    });

    if (!rate.ok) {
      const response = NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
      response.headers.set(
        "Retry-After",
        Math.ceil(rate.retryAfterMs / 1000).toString()
      );
      return response;
    }

    // Couleur de l'embed selon le type — cohérent avec l'UI membre.
    //   Warn  → amber  (avertissement)
    //   Jail  → orange (prison)
    //   Ban   → red    (bannissement)
    const typeLower = trimmedSanctionType.toLowerCase();
    const embedColor =
      typeLower === "warn" ? 0xf59e0b :
      typeLower === "jail" ? 0xf97316 :
      typeLower === "ban"  ? 0xdc2626 :
      0xef4444; // fallback red

    // Build message
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: "👤 Membre", value: member.rpName || "Inconnu", inline: true },
      { name: "🆔 Discord ID", value: discordId || "N/A", inline: true },
    ];

    if (trimmedSanctionType) {
      // Renommé "Sanction ID" → "Type de sanction" pour matcher la nouvelle UI.
      fields.push({ name: "🏷️ Type de sanction", value: trimmedSanctionType, inline: true });
    }

    if (trimmedContext) {
      fields.push({ name: "📋 Contexte", value: trimmedContext, inline: false });
    }

    fields.push({ name: "📝 Justification", value: trimmedReason, inline: false });

    const embed = {
      title: "⚠️ Justification de sanction",
      description: "Demande de justification reçue depuis l'espace membre.",
      color: embedColor,
      fields,
      footer: { text: "Panel Los Esperados" },
      timestamp: new Date().toISOString(),
    };

    logger.debug(
      "api:sanction",
      `Sending sanction justification for ${discordId}`
    );

    // Send to Discord via worker
    const discordResponse = await postDiscordMessage({
      channelId: DISCORD_CHANNEL_ID,
      embeds: [embed],
    });

    if (!discordResponse.ok) {
      logger.warn("api:sanction", `Discord worker error: ${discordResponse.error}`);
      return NextResponse.json(
        { error: "Failed to send to Discord" },
        { status: 500 }
      );
    }

    logger.immediate(
      "api:sanction",
      `✓ Sanction justification sent for ${discordId}`,
      { messageId: discordResponse.messageId }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("api:sanction", `${error}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
