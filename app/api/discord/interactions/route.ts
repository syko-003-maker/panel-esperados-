import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GRADE_LEVELS } from "@/lib/guards";
import { makeRequestId, logInfo, logWarn, logError } from "@/lib/obs";
import { verifyKey } from "discord-interactions";

// Types d'interaction Discord
type InteractionType = 1 | 2 | 3 | 4 | 5;
type InteractionResponseType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type InteractionKind = "button" | "modal" | "command" | "unknown";

interface DiscordInteraction {
  type: InteractionType;
  id: string;
  application_id: string;
  data?: {
    custom_id?: string;
    component_type?: number;
  };
  guild_id?: string;
  message?: {
    id?: string;
  };
  member?: {
    user: {
      id: string;
      username: string;
    };
  };
  user?: {
    id: string;
    username?: string;
  };
}

/**
 * Envoie une réponse d'interaction à Discord
 * type: 1 = PONG, 2 = CHANNEL_MESSAGE_WITH_SOURCE, 4 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
 * 5 = DEFERRED_UPDATE_MESSAGE, 6 = UPDATE_MESSAGE, 7 = APPLICATION_COMMAND_AUTOCOMPLETE_RESULT, 8 = MODAL
 */
function interactionResponse(
  type: InteractionResponseType,
  content?: string,
  ephemeral?: boolean
) {
  const data: any = {};
  if (content) {
    data.content = content;
    data.flags = ephemeral ? 64 : 0; // 64 = ephemeral
  }
  return NextResponse.json({ type, data });
}

function getInteractionKind(type: InteractionType): InteractionKind {
  if (type === 3) return "button";
  if (type === 5) return "modal";
  if (type === 2) return "command";
  return "unknown";
}

function getDeferType(kind: InteractionKind): InteractionResponseType {
  if (kind === "button") return 5; // DEFERRED_UPDATE_MESSAGE
  if (kind === "modal") return 4; // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  return 4;
}

function buildDedupeKey(params: {
  interactionId?: string | null;
  kind: InteractionKind;
  customId?: string | null;
  userId?: string | null;
  messageId?: string | null;
}): string {
  const { interactionId, kind, customId, userId, messageId } = params;
  if (interactionId) return `i:${interactionId}`;

  const bucket = Math.floor(Date.now() / 5_000);
  return `k:${kind}|c:${customId ?? "unknown"}|u:${userId ?? "unknown"}|m:${messageId ?? "unknown"}|t:${bucket}`;
}

async function recordInteractionEvent(params: {
  dedupeKey: string;
  kind: InteractionKind;
  customId?: string | null;
  userId?: string | null;
  guildId?: string | null;
  messageId?: string | null;
}): Promise<{ created: boolean }>
{
  try {
    await prisma.interactionEvent.create({
      data: {
        dedupeKey: params.dedupeKey,
        kind: params.kind,
        customId: params.customId ?? null,
        userId: params.userId ?? null,
        guildId: params.guildId ?? null,
        messageId: params.messageId ?? null,
      },
    });
    return { created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { created: false };
    }
    throw error;
  }
}

/**
 * Endpoint pour traiter les interactions Discord (boutons, modals, etc.)
 * POST /api/discord/interactions
 *
 * Traite uniquement les SANCTION_DECIDE interactions:
 * - Valide la signature Discord Ed25519
 * - Valide l'autorisation du staff (isActive + gradeLevel >= STAFF)
 * - Met à jour le status de la sanction
 * - Enqueue des jobs pour poster les logs et éditer le message
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  const requestId = req.headers.get("x-request-id") || makeRequestId();

  // 1. Vérifier la signature Discord
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey) {
    logError("interaction_signature_missing", {
      requestId,
      hasSignature: Boolean(signature),
      hasTimestamp: Boolean(timestamp),
      hasPublicKey: Boolean(publicKey),
    });
    return NextResponse.json({ ok: false, error: "Missing signature headers" }, { status: 401 });
  }

  const rawBody = await req.text();

  const isValid = verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) {
    logError("interaction_signature_invalid", { requestId });
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parser le body
  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction;
  } catch (error) {
    logError("interaction_invalid_json", { requestId }, error as Error);
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const kind = getInteractionKind(interaction.type);
  const customId = interaction.data?.custom_id ?? null;
  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
  const guildId = interaction.guild_id ?? null;
  const messageId = interaction.message?.id ?? null;

  logInfo("interaction_received", {
    requestId,
    kind,
    customId,
    userId,
    guildId,
    messageId,
    interactionId: interaction.id,
  });

  const logDone = (status: string) => {
    logInfo("interaction_done", {
      requestId,
      kind,
      customId,
      userId,
      guildId,
      status,
      durationMs: Date.now() - startTime,
    });
  };

  // Type 1 = PING -> répondre avec PONG (1)
  if (interaction.type === 1) {
    logDone("ping");
    return NextResponse.json({ type: 1 });
  }

  const dedupeKey = buildDedupeKey({
    interactionId: interaction.id,
    kind,
    customId,
    userId,
    messageId,
  });

  try {
    const dedupeResult = await recordInteractionEvent({
      dedupeKey,
      kind,
      customId,
      userId,
      guildId,
      messageId,
    });

    if (!dedupeResult.created) {
      logWarn("interaction_deduped", { requestId, dedupeKey, kind, customId, userId, guildId, messageId });
      logDone("deduped");
      return interactionResponse(getDeferType(kind));
    }
  } catch (error) {
    logError("interaction_dedupe_error", { requestId, dedupeKey }, error as Error);
    logDone("dedupe_error");
    return interactionResponse(4, "Erreur interne", true);
  }

  if (!customId) {
    logInfo("interaction_missing_custom_id", { requestId, kind, userId, guildId });
    logDone("missing_custom_id");
    return interactionResponse(getDeferType(kind));
  }

  // SANCTION_DECIDE:<sanctionId>:<decision>
  if (customId.startsWith("SANCTION_DECIDE:")) {
    const parts = customId.split(":");
    if (parts.length !== 3) {
      logDone("invalid_custom_id");
      return interactionResponse(2, "Invalid custom ID format", true);
    }

    const sanctionId = parts[1];
    const decision = parts[2];

    if (!["TRAITE", "NON_RESOLU", "REFUSE"].includes(decision)) {
      logDone("invalid_decision");
      return interactionResponse(2, "Invalid decision", true);
    }

    if (!userId) {
      logDone("missing_user");
      return interactionResponse(2, "Unable to identify user", true);
    }

    const ack = interactionResponse(getDeferType("button"));

    void handleSanctionDecision(sanctionId, decision, userId)
      .then((result) => {
        if (!result.ok) {
          logError("interaction_sanction_failed", {
            requestId,
            sanctionId,
            decision,
            userId,
            error: result.error,
            durationMs: Date.now() - startTime,
          });
          return;
        }

        logInfo("interaction_done", {
          requestId,
          kind: "button",
          customId,
          userId,
          guildId,
          durationMs: Date.now() - startTime,
        });
      })
      .catch((error) => {
        logError(
          "interaction_sanction_error",
          {
            requestId,
            sanctionId,
            decision,
            userId,
            durationMs: Date.now() - startTime,
          },
          error as Error
        );
      });

    return ack;
  }

  if (customId.startsWith("link:") || customId.startsWith("recruitment:") || customId.startsWith("complaint:")) {
    logInfo("interaction_unhandled_action", {
      requestId,
      kind,
      customId,
      userId,
      guildId,
    });
    logDone("unhandled_action");
    return interactionResponse(getDeferType(kind));
  }
  logDone("unmatched_action");
  return interactionResponse(getDeferType(kind));
}

async function handleSanctionDecision(
  sanctionId: string,
  decision: string,
  staffDiscordId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    // 1. Vérifier que le staff est autorisé (isActive + gradeLevel >= STAFF)
    const staffMember = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: "esperados", discordId: staffDiscordId } },
      select: { id: true, isActive: true, gradeLevel: true, rpName: true },
    });

    if (!staffMember) {
      console.warn("[discord/interactions] Staff member not found:", staffDiscordId);
      return { ok: false, error: "Non autorisé" };
    }

    if (!staffMember.isActive) {
      console.warn("[discord/interactions] Staff member inactive:", staffDiscordId);
      return { ok: false, error: "Non autorisé" };
    }

    if ((staffMember.gradeLevel ?? 0) < GRADE_LEVELS.STAFF) {
      console.warn("[discord/interactions] Insufficient permissions:", staffDiscordId, staffMember.gradeLevel);
      return { ok: false, error: "Non autorisé" };
    }

    // 2. Récupérer et mettre à jour la sanction
    const sanction = await prisma.sanction.findUnique({
      where: { id: sanctionId },
      select: {
        id: true,
        familyId: true,
        discordId: true,
        type: true,
        reason: true,
        status: true,
        notes: true,
        discordMessageId: true,
        startAt: true,
        endAt: true,
        durationHours: true,
      },
    });

    if (!sanction) {
      console.warn("[discord/interactions] Sanction not found:", sanctionId);
      return { ok: false, error: "Sanction introuvable" };
    }

    // 3. Mapper la décision à un état sanction
    // TRAITE -> status = CLOSED, notes = "Traité: <decision>"
    // NON_RESOLU -> status = ACTIVE, notes = "Non résolu"
    // REFUSE -> status = ACTIVE, notes = "Refusé"
    let newStatus = sanction.status;
    let notesPrefix = "";

    if (decision === "TRAITE") {
      newStatus = "CLOSED";
      notesPrefix = "[TRAITÉ]";
    } else if (decision === "NON_RESOLU") {
      notesPrefix = "[NON RÉSOLU]";
    } else if (decision === "REFUSE") {
      notesPrefix = "[REFUSÉ]";
    }

    const updatedNotes = notesPrefix
      ? `${notesPrefix} ${staffMember.rpName ?? "Staff"} - ${new Date().toISOString()}`
      : sanction.notes;

    // 4. Mettre à jour la sanction
    const updatedSanction = await prisma.sanction.update({
      where: { id: sanctionId },
      data: {
        status: newStatus,
        notes: updatedNotes,
        closedAt: decision === "TRAITE" ? new Date() : null,
      },
    });

    // Note: Decisions are logged in-db only, no Discord notification needed for now

    console.log(
      `[discord/interactions] Sanction decision recorded: id=${sanctionId} decision=${decision} staff=${staffDiscordId}`
    );
    
    return { ok: true };
  } catch (err) {
    console.error("[discord/interactions] Error in handleSanctionDecision:", err);
    return { ok: false, error: "Erreur interne" };
  }
}
