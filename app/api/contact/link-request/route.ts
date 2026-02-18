import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { prisma } from "@/lib/db";
import {
  CHEF_FAMILLE_ROLE_ID,
  ETAT_MAJOR_ROLE_ID,
  RECRUTEUR_ROLE_ID,
  isValidRoleId,
  logDiscordRoleConfig,
} from "@/lib/discord-roles";
import { mentionRolesString } from "@/lib/discord/mention-role";
import { NextResponse } from "next/server";
import { error as logError } from "@/lib/logger";

/**
 * ✅ POST /api/contact/link-request
 * Endpoint pour demander une liaison Discord -> Member
 *
 * Body: { steamId?: string } (optional SteamID64)
 *
 * Behavior:
 * - 200: Demande créée OU utilisateur déjà lié
 * - 400: SteamID invalide (si fourni)
 * - 409: Demande PENDING déjà existante
 * - 401: Non authentifié
 * - 403: Pas de Discord ID trouvé
 */
const DISCORD_CHANNEL_ID = process.env.BOTS_FAMILLE_CHANNEL_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PANEL_BASE_URL = (process.env.PANEL_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://losesperados.fr").replace(/\/+$/, "");

const ROLE_IDS = [RECRUTEUR_ROLE_ID, CHEF_FAMILLE_ROLE_ID, ETAT_MAJOR_ROLE_ID];

// Valider SteamID64 (17 chiffres)
function validateSteamId(steamId: string): boolean {
  return /^[0-9]{17}$/.test(steamId);
}

export async function POST(request: Request) {
  try {
    // Parse body pour steamId optionnel
    let body: { steamId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Si pas de body, c'est ok (steamId optionnel)
    }

    const steamId = body.steamId?.trim();

    // ✅ Valider steamId si fourni
    if (steamId && !validateSteamId(steamId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid SteamID64 format. Must be exactly 17 digits.",
        },
        { status: 400 }
      );
    }

    // ✅ ÉTAPE 1: Vérifier authentification
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    let discordId = (session.user as any).discordId || (session as any).discordId;

    // Si pas dans la session, essayer via Prisma Account (provider="discord")
    if (!discordId && userId) {
      const account = await prisma.account.findFirst({
        where: {
          userId: userId,
          provider: "discord",
        },
      });
      discordId = account?.providerAccountId;
    }

    if (!userId || !discordId) {
      return NextResponse.json(
        { ok: false, error: "Missing Discord ID" },
        { status: 403 }
      );
    }

    // ✅ ÉTAPE 2: Vérifier si déjà lié
    const scope = await getMemberScopeOrNull(session);
    if (scope) {
      // Utilisateur déjà lié
      return NextResponse.json({
        ok: true,
        message: "User is already linked",
      });
    }

    // ✅ ÉTAPE 3: Vérifier si une demande PENDING existe déjà
    const existingPending = await prisma.linkRequest.findFirst({
      where: {
        familyId: "esperados",
        requesterDiscordId: discordId,
        status: "PENDING",
      },
    });

    if (existingPending) {
      // Demande déjà en attente
      return NextResponse.json(
        {
          ok: false,
          error: "Link request already pending",
          requestId: existingPending.id,
        },
        { status: 409 }
      );
    }

    // ✅ ÉTAPE 4: Créer la demande avec steamId optionnel
    const username = session.user.name || "Unknown";
    const linkRequest = await prisma.linkRequest.create({
      data: {
        familyId: "esperados",
        requesterDiscordId: discordId,
        requesterName: username,
        steamId: steamId || null,
        status: "PENDING",
      },
    });

    // ✅ ÉTAPE 5: Envoyer message Discord (optionnel, pas critique)
    if (DISCORD_CHANNEL_ID && DISCORD_BOT_TOKEN) {
      try {
        logDiscordRoleConfig("contact-link-request");
        // ✅ MEGA PATCH #3: Safe role mention with validation
        const roleMentions = mentionRolesString(ROLE_IDS);

        // Construire les champs de l'embed
        const fields: any[] = [
          {
            name: "Utilisateur Discord",
            value: `<@${discordId}> (\`${username}\`)`,
            inline: false,
          },
          {
            name: "Discord ID",
            value: `\`${discordId}\``,
            inline: true,
          },
          {
            name: "État",
            value: "🔴 En attente",
            inline: true,
          },
        ];

        fields.push({
          name: "SteamID64",
          value: steamId ? `\`${steamId}\`` : "Non fourni",
          inline: true,
        });

        fields.push(
          {
            name: "Date",
            value: `<t:${Math.floor(Date.now() / 1000)}:f>`,
            inline: false,
          },
          {
            name: "Lien Panel",
            value: `[Aller à /staff/link](${PANEL_BASE_URL}/staff/link)`,
            inline: false,
          }
        );

        const embed = {
          title: "🔗 Demande de liaison",
          description: `Nouvel utilisateur demande une liaison de compte`,
          color: 0x10b981, // emerald green
          fields,
          footer: {
            text: "Los Esperados • Panel interne",
            icon_url: `${PANEL_BASE_URL}/branding/los-esperados.png`,
          },
          timestamp: new Date().toISOString(),
        };

        // Boutons d'action
        const buttons = [
          {
            type: 2, // Button
            style: 3, // PRIMARY (bleu)
            label: "✅ Traiter",
            custom_id: `linkreq:open:${linkRequest.id}:${discordId}`,
          },
          {
            type: 2,
            style: 4, // DANGER (rouge)
            label: "❌ Refuser",
            custom_id: `linkreq:refuse:${linkRequest.id}:${discordId}`,
          },
          {
            type: 2,
            style: 2, // SECONDARY (gris)
            label: "💤 Archiver",
            custom_id: `linkreq:archive:${linkRequest.id}:${discordId}`,
          },
        ];

        const components = [
          {
            type: 1, // Action Row
            components: buttons,
          },
        ];

        const discordPayload = {
          content: `${roleMentions}`,
          embeds: [embed],
          components,
        };

        const discordResponse = await fetch(
          `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(discordPayload),
          }
        );

        if (discordResponse.ok) {
          const discordMessage = await discordResponse.json();
          await prisma.linkRequest.update({
            where: { id: linkRequest.id },
            data: { discordMessageId: discordMessage.id },
          });
        } else {
          logError(
            "[link-request] Discord API error:",
            await discordResponse.text()
          );
        }
      } catch (err) {
        logError("[link-request] Failed to send Discord message:", err);
        // Don't fail the response if Discord fails - just log it
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Link request created successfully",
      requestId: linkRequest.id,
      steamIdProvided: !!steamId,
    });
  } catch (err: any) {
    logError("[link-request] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
