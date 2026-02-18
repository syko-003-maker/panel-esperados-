/**
 * Discord interactions handler (buttons, modals)
 */

import {
  Interaction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
  Guild,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "@/lib/db";

let apiBaseUrlCache: string | null = null;

function getApiBaseUrl(env?: any): string {
  if (apiBaseUrlCache) return apiBaseUrlCache;

  const baseUrl =
    env?.siteBaseUrl ||
    process.env.SITE_BASE_URL ||
    process.env.DISCORD_API_BASE_URL ||
    "http://127.0.0.1:3000";

  apiBaseUrlCache = baseUrl.replace(/\/$/, "");
  console.log("[interactions] apiBaseUrl=", apiBaseUrlCache);
  return apiBaseUrlCache!;
}

function apiUrl(path: string, env?: any): string {
  const base = getApiBaseUrl(env);
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function safeEditReply(interaction: any, content: any) {
  const MAX = 1900;
  const text = typeof content === "string" ? content : String(content);
  return interaction.editReply(text.length > MAX ? text.slice(0, MAX) + "…" : text);
}

async function pingApi(env?: any): Promise<boolean> {
  const baseUrl = getApiBaseUrl(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      signal: controller.signal,
    }).catch(() => fetch(`${baseUrl}/api/me`, { signal: controller.signal }));

    clearTimeout(timer);
    return res.ok || res.status < 500;
  } catch (err: any) {
    clearTimeout(timer);
    console.error("[interactions] API ping failed:", {
      baseUrl,
      error: err.message,
      code: err.code,
    });
    return false;
  }
}

async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 8000, env?: any) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    const ctype = res.headers.get("content-type") || "";
    if (ctype.includes("text/html")) {
      throw new Error("API returned HTML (likely 404 route)");
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err: any) {
    const baseUrl = getApiBaseUrl(env);
    console.error("[interactions] fetchWithTimeout failed:", {
      url,
      baseUrl,
      errorCode: err.code,
      errorCause: err.cause,
      message: err.message,
    });

    if (err.name === "AbortError") {
      throw new Error(`API timeout after ${timeoutMs}ms (check if npm run dev is running)`);
    }

    if (err.code === "ECONNREFUSED") {
      throw new Error(
        `API unreachable at ${baseUrl} (ECONNREFUSED). Make sure Next.js is running: npm run dev`
      );
    }

    throw new Error(`API fetch failed: ${err.message} (check SITE_BASE_URL=${baseUrl})`);
  } finally {
    clearTimeout(timer);
  }
}

function slugify(text: string, maxLength = 90): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

function buildPermissionOverwrites(guild: Guild, authorDiscordId: string, staffRoleId?: string) {
  const overwrites: any[] = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: authorDiscordId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
    },
  ];

  if (staffRoleId) {
    overwrites.push({
      id: staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  return overwrites;
}

async function createTicketChannel(
  guild: Guild,
  categoryId: string,
  name: string,
  overwrites: any[]
) {
  return await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: overwrites,
  });
}

function showRecruitmentModal(interaction: any) {
  const modal = new ModalBuilder()
    .setCustomId("ticket:recruitment:submit")
    .setTitle("📌 Nouveau Recrutement");

  const rpName = new TextInputBuilder()
    .setCustomId("rpName")
    .setLabel("Nom RP")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Ex: Nelson Meledo");

  const steamId = new TextInputBuilder()
    .setCustomId("steamId")
    .setLabel("Steam ID (OBLIGATOIRE)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("SteamID64 obligatoire");

  const age = new TextInputBuilder()
    .setCustomId("age")
    .setLabel("Âge (min 16)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Ex: 18");

  const activeSanctions = new TextInputBuilder()
    .setCustomId("activeSanctions")
    .setLabel("Nombre de sanctions actives")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Ex: 0");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(rpName),
    new ActionRowBuilder<TextInputBuilder>().addComponents(steamId),
    new ActionRowBuilder<TextInputBuilder>().addComponents(age),
    new ActionRowBuilder<TextInputBuilder>().addComponents(activeSanctions)
  );

  return interaction.showModal(modal);
}

function showComplaintModal(interaction: any) {
  const modal = new ModalBuilder()
    .setCustomId("ticket:complaint:submit")
    .setTitle("⚖️ Nouvelle Plainte");

  const title = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Titre")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Résumé court");

  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Description détaillée")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Décrivez les faits (screen obligatoire)");

  const targetDiscordId = new TextInputBuilder()
    .setCustomId("targetDiscordId")
    .setLabel("Contre qui (Discord ID ou @mention)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder("Ex: 123456789012345678");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(title),
    new ActionRowBuilder<TextInputBuilder>().addComponents(description),
    new ActionRowBuilder<TextInputBuilder>().addComponents(targetDiscordId)
  );

  return interaction.showModal(modal);
}

// ✅ Handle link request buttons (open/refuse/archive)
async function handleLinkRequestButton(interaction: any, env: any) {
  // ⚠️ Guard: check if already deferred (avoid double ACK if processed by discord-worker already)
  const alreadyAcked = interaction.deferred || interaction.replied;
  
  if (!alreadyAcked) {
    // ✅ CRITICAL: Defer UPDATE IMMEDIATELY to acknowledge button click (prevents 3s timeout)
    // deferUpdate() keeps the original message and doesn't show an empty response
    try {
      await interaction.deferUpdate();
      console.log("[ACK_OK]", interaction.customId);
    } catch (ackError) {
      console.error("[ACK_FAILED]", interaction.customId, ackError instanceof Error ? ackError.message : String(ackError));
      return;
    }
  } else {
    console.log("[ACK_SKIP_ALREADY_ACKED]", interaction.customId);
  }

  // Log the click for debugging
  console.log(
    "[linkreq click]",
    interaction.customId,
    "userId=" + interaction.user?.id,
    "channelId=" + interaction.channelId
  );

  try {
    // Parse custom_id: linkreq:action:requestId:requesterDiscordId
    // Example: linkreq:open:ckxxx:123456789
    const parts = interaction.customId.split(":");
    if (parts.length !== 4 || parts[0] !== "linkreq") {
      await interaction.followUp({
        content: "❌ Bouton invalide",
        ephemeral: true,
      });
      return;
    }

    const [, action, requestId, requesterDiscordId] = parts;

    // Vérifier que l'utilisateur a l'un des rôles requis
    const requiredRoles = [
      "1312845999215214618", // Recruteur
      "1429607761720770623", // Chef Famille
      "1312845999366209683", // État Major
    ];

    const userHasRole = requiredRoles.some((roleId) => 
      interaction.member.roles.cache.has(roleId)
    );

    if (!userHasRole) {
      await interaction.followUp({
        content: "❌ Vous n'avez pas les permissions nécessaires pour cette action",
        ephemeral: true,
      });
      return;
    }

    // Valider l'action
    if (!["open", "refuse", "archive"].includes(action)) {
      await interaction.followUp({
        content: "❌ Action invalide",
        ephemeral: true,
      });
      return;
    }

    const staffName = interaction.user.username;
    const staffId = interaction.user.id;
    const ingestSecret = process.env.INGEST_SECRET || "";
    const apiBaseUrl = getApiBaseUrl(env);

    // ✅ ACTION 1 : OPEN (Traiter) — LOCK ATOMIQUE
    if (action === "open") {
      // Appeler /lock pour obtenir le lock atomique
      const lockResponse = await fetch(
        `${apiBaseUrl}/api/internal/link-requests/lock`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-ingest-secret": ingestSecret,
          },
          body: JSON.stringify({
            requestId,
            staffDiscordId: staffId,
            staffUsername: staffName,
          }),
        }
      );

      if (!lockResponse.ok) {
        const errorData = await lockResponse.json().catch(() => ({}));
        const reason = errorData.reason;
        const error = errorData.error || "Unknown error";

        if (reason === "ALREADY_LOCKED") {
          // Quelqu'un d'autre a déjà lock
          const lockedBy = errorData.data?.lockedByUsername || "Unknown";
          const lockedById = errorData.data?.lockedByDiscordId;
          await interaction.followUp({
            content: `⛔ Déjà pris en charge par <@${lockedById}> (${lockedBy})`,
            ephemeral: true,
          });
        } else if (reason === "ALREADY_TREATED") {
          // Demande déjà traitée (refuse/archive)
          await interaction.followUp({
            content: `✅ Demande déjà traitée (statut: ${errorData.data?.status})`,
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            content: `❌ Erreur: ${error}`,
            ephemeral: true,
          });
        }
        return;
      }

      // ✅ Lock acquis !
      const lockData = await lockResponse.json();
      
      // Répondre au staff avec le lien du panel (followUp épémère)
      const panelBaseUrl = (process.env.PANEL_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://losesperados.fr").replace(/\/+$/, "");
      const panelUrl = `${panelBaseUrl}/staff/link?discordId=${requesterDiscordId}`;
      const embed = new EmbedBuilder()
        .setTitle("✅ Demande ouverte")
        .setColor(0x10b981)
        .addFields({
          name: "Panel de liaison",
          value: panelUrl,
        })
        .setTimestamp();

      await interaction.followUp({
        content: `✅ Demande ouverte. Vous pouvez liaiser l'utilisateur : ${panelUrl}`,
        embeds: [embed],
        ephemeral: true,
      });

      // Éditer le message Discord original
      try {
        const linkRequest = await prisma.linkRequest.findUnique({
          where: { id: requestId },
        });

        if (linkRequest?.discordMessageId && interaction.channel) {
          const message = await interaction.channel.messages.fetch(
            linkRequest.discordMessageId
          );

          if (message && message.embeds[0]) {
            const existingEmbed = message.embeds[0];
            const updatedEmbed = new EmbedBuilder(existingEmbed.data)
              .setColor(0xf59e0b) // Amber pour "en cours"
              .addFields({
                name: "État",
                value: "🟡 En cours",
              })
              .addFields({
                name: "Pris en charge par",
                value: `<@${staffId}> (${staffName})`,
              })
              .setTimestamp();

            // Désactiver le bouton "Traiter", laisser Refuser/Archiver actifs
            const updatedComponents = message.components.map((row: any) => {
              const newRow = new ActionRowBuilder<any>();
              row.components.forEach((btn: any) => {
                // Désactiver le bouton "Traiter" (open)
                if (btn.data?.custom_id?.includes(":open:")) {
                  newRow.addComponents(btn.setDisabled(true));
                } else {
                  // Laisser Refuser/Archiver actifs (pour ce staff)
                  newRow.addComponents(btn.setDisabled(false));
                }
              });
              return newRow;
            });

            await message.edit({
              embeds: [updatedEmbed],
              components: updatedComponents,
            });
          }
        }
      } catch (err) {
        console.error("[link-request] Failed to edit message:", err);
      }

      return;
    }

    // ✅ ACTION 2 & 3 : REFUSE / ARCHIVE — Vérifier le lock
    if (action === "refuse" || action === "archive") {
      // Récupérer la demande pour vérifier le lock
      const linkRequest = await prisma.linkRequest.findUnique({
        where: { id: requestId },
      });

      if (!linkRequest) {
        await interaction.followUp({
          content: "❌ Demande introuvable",
          ephemeral: true,
        });
        return;
      }

      // Vérifier les permissions pour finaliser
      const staffRoles = Array.from(interaction.member.roles.cache.keys());
      const hasOverride = staffRoles.some((roleId: any) =>
        ["1429607761720770623", "1312845999366209683"].includes(roleId)
      );

      // Si quelqu'un d'autre a lock et ce staff n'a pas le override
      if (
        linkRequest.status === "OPENED" &&
        linkRequest.lockedByDiscordId &&
        linkRequest.lockedByDiscordId !== staffId &&
        !hasOverride
      ) {
        await interaction.followUp({
          content: `⛔ Prise en charge par <@${linkRequest.lockedByDiscordId}> (${linkRequest.lockedByUsername}). Seul Chef/EtatMajor peut finaliser.`,
          ephemeral: true,
        });
        return;
      }

      // Appeler /resolve pour finaliser
      const resolveResponse = await fetch(
        `${apiBaseUrl}/api/internal/link-requests/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-ingest-secret": ingestSecret,
          },
          body: JSON.stringify({
            requestId,
            action: action === "refuse" ? "refuse" : "archive",
            staffDiscordId: staffId,
            staffUsername: staffName,
            staffRoles, // Pour déterminer l'override
          }),
        }
      );

      if (!resolveResponse.ok) {
        const errorData = await resolveResponse.json().catch(() => ({}));
        const reason = errorData.reason;
        const error = errorData.error || "Unknown error";

        if (reason === "LOCKED_BY_OTHER") {
          const lockedBy = errorData.data?.lockedByUsername || "Unknown";
          const lockedById = errorData.data?.lockedByDiscordId;
          await interaction.followUp({
            content: `⛔ Prise en charge par <@${lockedById}> (${lockedBy})`,
            ephemeral: true,
          });
        } else if (reason === "ALREADY_TREATED") {
          await interaction.followUp({
            content: `✅ Déjà traité (statut: ${errorData.data?.status})`,
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            content: `❌ Erreur: ${error}`,
            ephemeral: true,
          });
        }
        return;
      }

      // ✅ Demande résolue !
      const resolveData = await resolveResponse.json();
      const newStatus = resolveData.data?.status;
      const wasOverride = resolveData.data?.wasByOverride;

      // Préparer le message de confirmation
      let confirmMsg = "";
      let embedTitle = "";
      let embedColor = 0x6b7280;
      let stateEmoji = "⚪";

      if (action === "refuse") {
        confirmMsg = "❌ Demande refusée";
        embedTitle = "❌ Demande refusée";
        embedColor = 0xef4444;
        stateEmoji = "⚫";
      } else if (action === "archive") {
        confirmMsg = "💤 Demande archivée";
        embedTitle = "💤 Demande archivée";
        embedColor = 0x6b7280;
        stateEmoji = "⚪";
      }

      const embed = new EmbedBuilder()
        .setTitle(embedTitle)
        .setColor(embedColor)
        .addFields({
          name: "Traité par",
          value: `<@${staffId}> (${staffName})`,
        });

      if (wasOverride) {
        embed.addFields({
          name: "⚠️ Override par Chef/EtatMajor",
          value: "Cette demande a été finalisée avec un override",
        });
      }

      embed.setTimestamp();

      await interaction.followUp({
        content: confirmMsg,
        embeds: [embed],
        ephemeral: true,
      });

      // Éditer le message Discord original
      try {
        if (linkRequest.discordMessageId && interaction.channel) {
          const message = await interaction.channel.messages.fetch(
            linkRequest.discordMessageId
          );

          if (message && message.embeds[0]) {
            const existingEmbed = message.embeds[0];
            const updatedEmbed = new EmbedBuilder(existingEmbed.data)
              .setTitle(embedTitle)
              .setColor(embedColor)
              .addFields({
                name: "État",
                value: `${stateEmoji} ${newStatus === "REFUSED" ? "Refusée" : "Archivée"}`,
              })
              .addFields({
                name: "Finalisé par",
                value: `<@${staffId}> (${staffName})`,
              });

            if (wasOverride) {
              updatedEmbed.addFields({
                name: "⚠️ Override",
                value: "Override par Chef/EtatMajor",
              });
            }

            updatedEmbed.setTimestamp();

            // Désactiver tous les boutons
            const disabledComponents = message.components.map((row: any) => {
              const newRow = new ActionRowBuilder<any>();
              row.components.forEach((btn: any) => {
                newRow.addComponents(btn.setDisabled(true));
              });
              return newRow;
            });

            await message.edit({
              embeds: [updatedEmbed],
              components: disabledComponents,
            });
          }
        }
      } catch (err) {
        console.error("[link-request] Failed to edit message:", err);
      }

      return;
    }
  } catch (err) {
    console.error("[linkreq] Error handling button:", err);
    // Always use followUp for responses after deferUpdate
    await interaction.followUp({
      content: "❌ Erreur lors du traitement de la demande",
      ephemeral: true,
    }).catch((e: any) => console.error("[linkreq] Failed to send error response:", e));
  }
}

export async function handleInteraction(interaction: Interaction, env: any) {
  if (interaction.isButton()) {
    const { customId } = interaction;

    if (customId === "ticket:recruitment") {
      await showRecruitmentModal(interaction);
      return;
    }

    if (customId === "ticket:complaint") {
      await showComplaintModal(interaction);
      return;
    }

    // ✅ Handle link request buttons (linkreq:action:requestId:discordId)
    if (customId.startsWith("linkreq:")) {
      await handleLinkRequestButton(interaction, env);
      return;
    }

    // ...existing code for other buttons...
  }

  if (interaction.isModalSubmit()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.customId === "ticket:recruitment:submit") {
      let createdChannel: any = null;

      try {
        const rpName = interaction.fields.getTextInputValue("rpName")?.trim();
        const steamId = interaction.fields.getTextInputValue("steamId")?.trim();
        const ageRaw = interaction.fields.getTextInputValue("age")?.trim();
        const sanctionsRaw = interaction.fields.getTextInputValue("activeSanctions")?.trim();

        if (!rpName || rpName.length < 3) {
          await safeEditReply(interaction, "❌ Nom RP invalide (min 3 caractères).");
          return;
        }
        if (!steamId || steamId.length < 10) {
          await safeEditReply(interaction, "❌ Steam ID invalide.");
          return;
        }
        const age = Number(ageRaw);
        if (!Number.isFinite(age) || age < 16) {
          await safeEditReply(interaction, "❌ Âge invalide (doit être un nombre ≥ 16).");
          return;
        }
        const activeSanctions = Number(sanctionsRaw);
        if (!Number.isFinite(activeSanctions) || activeSanctions < 0) {
          await safeEditReply(interaction, "❌ Nombre de sanctions invalide.");
          return;
        }

        // Ping API before creating channel
        console.log("[interactions] Pinging API before channel creation...");
        const apiAvailable = await pingApi(env);
        if (!apiAvailable) {
          await safeEditReply(
            interaction,
            "❌ Le site est actuellement hors ligne. Réessaie dans quelques minutes."
          );
          console.warn("[interactions] API ping failed, aborting recruitment creation");
          return;
        }

        const authorDiscordId = interaction.user.id;
        const guild = interaction.guild;
        if (!guild) {
          await safeEditReply(interaction, "❌ Erreur: guild non disponible.");
          return;
        }

        // Create channel under CATEGORY
        const channelName = `recrutement-${slugify(rpName)}`;
        const overwrites = buildPermissionOverwrites(guild, authorDiscordId, env.staffRoleId);
        createdChannel = await createTicketChannel(
          guild,
          env.ticketsCategoryId,
          channelName,
          overwrites
        );

        console.log("[interactions] Created recruitment channel:", {
          channelId: createdChannel.id,
          name: channelName,
          categoryId: env.ticketsCategoryId,
        });

        // Create DB record via API with ticketChannelId
        const payload = {
          rpName,
          steamId,
          age,
          activeSanctions,
          authorDiscordId,
          ticketChannelId: createdChannel.id,
        };

        const apiEndpoint = apiUrl("/api/discord/recruitment", env);
        console.log("[interactions] Calling API:", apiEndpoint);

        const res = await fetchWithTimeout(
          apiEndpoint,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
          8000,
          env
        );

        console.log("[interactions] Recruitment API response:", res);

        // Send initial embed in channel
        const embed = new EmbedBuilder()
          .setTitle("🟢 Recrutement — Nouveau dossier")
          .setColor(0x57f287)
          .addFields(
            { name: "👤 RP Name", value: rpName, inline: true },
            { name: "🎮 Steam ID", value: steamId, inline: true },
            { name: "🔢 Âge", value: String(age), inline: true },
            { name: "⚠️ Sanctions actives", value: String(activeSanctions), inline: true },
            { name: "🆔 Discord", value: `<@${authorDiscordId}>`, inline: false }
          )
          .setDescription(
            "📸 **SCREEN OBLIGATOIRE** : Un membre du staff te demandera un screen de tes sanctions actives.\n\n" +
              "Merci pour ta demande. Un membre du staff prendra contact ici."
          )
          .setFooter({ text: "Ticket géré via le panel staff Los Esperados" })
          .setTimestamp();

        await createdChannel.send({ embeds: [embed] });

        await safeEditReply(
          interaction,
          `✅ Ticket créé avec succès dans <#${createdChannel.id}>.\n📸 Un screen des sanctions actives sera demandé par le staff.`
        );
      } catch (err: any) {
        console.error("[interactions] Recruitment submit failed:", err);

        // Cleanup: delete orphaned channel
        if (createdChannel) {
          try {
            await createdChannel.send(
              "❌ Erreur lors de la création du ticket. Le salon va être supprimé."
            );
            await new Promise((resolve) => setTimeout(resolve, 3000));
            await createdChannel.delete("Ticket creation failed");
            console.log("[interactions] Deleted orphaned channel:", createdChannel.id);
          } catch (cleanupErr) {
            console.error("[interactions] Failed to cleanup channel:", cleanupErr);
          }
        }

        await safeEditReply(
          interaction,
          `❌ Impossible de créer le ticket.\n${err.message || "Réessaie dans 30s."}`
        );
      }
      return;
    }

    if (interaction.customId === "ticket:complaint:submit") {
      let createdChannel: any = null;

      try {
        const title = interaction.fields.getTextInputValue("title")?.trim();
        const description = interaction.fields.getTextInputValue("description")?.trim();
        const targetDiscordIdRaw = interaction.fields.getTextInputValue("targetDiscordId")?.trim();
        const targetDiscordId = targetDiscordIdRaw || null;

        if (!title || title.length < 3) {
          await safeEditReply(interaction, "❌ Titre invalide.");
          return;
        }
        if (!description || description.length < 10) {
          await safeEditReply(interaction, "❌ Description invalide.");
          return;
        }

        // Ping API before creating channel
        console.log("[interactions] Pinging API before channel creation...");
        const apiAvailable = await pingApi(env);
        if (!apiAvailable) {
          await safeEditReply(
            interaction,
            "❌ Le site est actuellement hors ligne. Réessaie dans quelques minutes."
          );
          console.warn("[interactions] API ping failed, aborting complaint creation");
          return;
        }

        const authorDiscordId = interaction.user.id;
        const guild = interaction.guild;
        if (!guild) {
          await safeEditReply(interaction, "❌ Erreur: guild non disponible.");
          return;
        }

        // Create channel under CATEGORY
        const channelSlug = slugify(title);
        const channelName = `plainte-${channelSlug}`;
        const overwrites = buildPermissionOverwrites(guild, authorDiscordId, env.staffRoleId);
        createdChannel = await createTicketChannel(
          guild,
          env.ticketsCategoryId,
          channelName,
          overwrites
        );

        console.log("[interactions] Created complaint channel:", {
          channelId: createdChannel.id,
          name: channelName,
          categoryId: env.ticketsCategoryId,
        });

        // Create DB record via API with ticketChannelId
        const payload: any = {
          title,
          description,
          targetDiscordId,
          authorDiscordId,
          ticketChannelId: createdChannel.id,
        };

        const apiEndpoint = apiUrl("/api/discord/complaint", env);
        console.log("[interactions] Calling API:", apiEndpoint);

        const res = await fetchWithTimeout(
          apiEndpoint,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
          8000,
          env
        );

        console.log("[interactions] Complaint API response:", res);

        // Send initial embed in channel
        const embed = new EmbedBuilder()
          .setTitle("🔴 Plainte — Nouveau dossier")
          .setColor(0xed4245)
          .addFields(
            { name: "📌 Titre", value: title, inline: false },
            {
              name: "🎯 Cible",
              value: targetDiscordId ? `<@${targetDiscordId}>` : "Non renseigné",
              inline: true,
            },
            { name: "👤 Auteur", value: `<@${authorDiscordId}>`, inline: true }
          )
          .setDescription(
            "📸 **SCREEN OBLIGATOIRE** : Merci de fournir des preuves (captures d'écran) à la demande du staff.\n\n" +
              "La plainte a été enregistrée. Merci de rester factuel et respectueux."
          )
          .setFooter({ text: "Ticket géré via le panel staff Los Esperados" })
          .setTimestamp();

        await createdChannel.send({ embeds: [embed], content: `**Description:**\n${description}` });

        await safeEditReply(
          interaction,
          `✅ Ticket créé dans <#${createdChannel.id}>.\nUn staff te répondra bientôt.`
        );
      } catch (err: any) {
        console.error("[interactions] Complaint submit failed:", err);

        // Cleanup: delete orphaned channel
        if (createdChannel) {
          try {
            await createdChannel.send(
              "❌ Erreur lors de la création du ticket. Le salon va être supprimé."
            );
            await new Promise((resolve) => setTimeout(resolve, 3000));
            await createdChannel.delete("Ticket creation failed");
            console.log("[interactions] Deleted orphaned channel:", createdChannel.id);
          } catch (cleanupErr) {
            console.error("[interactions] Failed to cleanup channel:", cleanupErr);
          }
        }

        await safeEditReply(
          interaction,
          `❌ Impossible de créer le ticket.\n${err.message || "Réessaie dans 30s."}`
        );
      }
      return;
    }

    // ...ensure any other modal submits also end with safeEditReply...
  }

  // ...existing code...
}
