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

    // Type → emoji + couleur (cohérent avec l'UI membre : Warn / Jail / Ban).
    const typeLower = trimmedSanctionType.toLowerCase();
    const TYPE_META: Record<string, { emoji: string; color: number }> = {
      warn: { emoji: "⚠️", color: 0xf59e0b }, // amber
      jail: { emoji: "⛓️", color: 0xf97316 }, // orange
      ban: { emoji: "🔨", color: 0xdc2626 }, // red
    };
    const typeMeta = TYPE_META[typeLower];
    const embedColor = typeMeta?.color ?? 0x6366f1; // fallback indigo (espace membre)

    // Discord : un field value ≤ 1024 caractères — on tronque par sécurité
    // pour ne jamais faire rejeter l'embed (400) sur un texte trop long.
    const clamp = (s: string, n: number): string =>
      s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

    // Le membre en mention cliquable (<@id>) plutôt qu'un ID brut illisible.
    // Une mention dans un embed ne ping personne — c'est purement visuel.
    const memberValue = discordId
      ? `**${member.rpName || "Inconnu"}**\n<@${discordId}>`
      : `**${member.rpName || "Inconnu"}**`;

    const typeValue = trimmedSanctionType
      ? `${typeMeta ? `${typeMeta.emoji} ` : ""}${trimmedSanctionType}`
      : "—";

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: "👤 Membre", value: memberValue, inline: true },
      { name: "🏷️ Type de sanction", value: typeValue, inline: true },
    ];

    if (trimmedContext) {
      fields.push({
        name: "📋 Contexte donné",
        value: `>>> ${clamp(trimmedContext, 1000)}`,
        inline: false,
      });
    }

    fields.push({
      name: "📝 Justification du membre",
      value: `>>> ${clamp(trimmedReason, 1000)}`,
      inline: false,
    });

    const LOGO_URL = "https://losesperados.fr/branding/los-esperados.png";
    const embed = {
      author: { name: "Espace membre · Los Esperados", icon_url: LOGO_URL },
      title: "⚠️ Justification de sanction",
      description:
        "Un membre a justifié une sanction reçue, directement depuis son espace.",
      color: embedColor,
      fields,
      thumbnail: { url: LOGO_URL },
      footer: { text: "Panel Los Esperados", icon_url: LOGO_URL },
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
