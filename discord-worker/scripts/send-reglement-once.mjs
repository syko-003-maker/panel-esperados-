import { config as loadDotenv } from "dotenv";
import {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
} from "discord.js";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REGLEMENT_CHANNEL_ID = "1312846001693786162";
const REGLEMENT_EMBED_COLOR = 0x7f1d1d; // Bordeaux — cohérent avec le panel
const LOS_ESPERADOS_ROLE_ID = "1312845999340781646";
const LAST_MESSAGE_ID = "1492689986091483330"; // message à supprimer avant renvoi

function loadWorkerEnv() {
  const candidates = [
    resolve(__dirname, "../.env.prod"),
    resolve(__dirname, "../../.env.prod"),
    resolve(__dirname, "../../.env.local"),
    resolve(__dirname, "../.env"),
    resolve(__dirname, "../../.env"),
  ];
  const envPath = candidates.find((p) => existsSync(p));
  if (envPath) {
    loadDotenv({ path: envPath, override: false });
    console.log(`[reglement] env chargé depuis ${envPath}`);
  } else {
    loadDotenv();
    console.log("[reglement] env chargé depuis les défauts du processus");
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

function buildReglementEmbed() {
  const description = [
    "Bonsoir à tous,",
    "Merci de prendre connaissance de ce règlement et de le respecter afin de maintenir une bonne ambiance au sein de la famille.",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "🔹 **1. Règles générales**",
    "• Toute sanction RP doit être signalée à un État-Major via le site ou en vocal",
    "• Le respect est obligatoire envers tous",
    "• Aucun trash toléré en //HRP",
    "• Les recruteurs peuvent refuser un recrutement",
    "• Playtime minimum : 300 minutes / semaine",
    "• Communications radio uniquement via Discord",
    "• Abus de permissions à signaler à un État-Major",
    "• En cas de problème → contactez un État-Major",
    "• Vocal Discord obligatoire en jeu",
    "• Sans Spé → aucun UP pendant 1 semaine",
    "• Spé obligatoire à partir de [WL-4] Soldato",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "🔹 **2. Respect & comportement**",
    "• Interdiction d'insulter ou manquer de respect",
    "• Interdiction de provoquer des conflits",
    "• Interdiction de troller ou discriminer",
    "• Interdiction de propos haineux (racisme, etc.)",
    "• Interdiction de manquer de respect à un État-Major",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "🔹 **3. Comportement textuel**",
    "• Publicité interdite sans autorisation",
    "• Spam interdit",
    "• Flood interdit",
    "• Abus de mentions interdit",
    "✔️ Autorisé uniquement : demande d'action RP",
    "➜ Abus = ⚠️ Averto Léger",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "🔹 **4. Comportement vocal**",
    "• Interdiction de crier",
    "• Insultes interdites",
    "• Micro propre obligatoire",
    "• Ne pas couper la parole",
    "• Cri = ⚠️ Averto Léger → Averto Lourd si abus",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "🔹 **5. Sanctions & activité**",
    "• Toute sanction IG doit être signalée",
    "• ⏳ Période test : 1 semaine",
    "➜ Mauvais comportement = exclusion immédiate",
    "• Abus de permissions sanctionnés",
    "• Non-respect du règlement → sanction / blacklist",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "🔹 **6. Profil & identité**",
    "• Pseudo correct obligatoire",
    "• Photo appropriée obligatoire",
    "• Pseudo Discord = Nom RP",
    "• Usurpation interdite",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "🔹 **7. Organisation interne**",
    "• Respecter l'utilité des salons",
    "• Respect des décisions staff",
    "• Fuite d'informations interdite",
    "• Règlement modifiable à tout moment",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "🔹 **Esprit de la famille**",
    "",
    "Nous sommes tous dans la même famille RP.",
    "Respectez-vous, entraidez-vous et restez fair-play.",
    "",
    "🏹 Montrez vos talents",
    "✨ Soyez irréprochables",
    "",
    "@los esperados",
  ].join("\n");

  return new EmbedBuilder()
    .setTitle("📢 Règlement Officiel — Famille Los Esperados")
    .setColor(REGLEMENT_EMBED_COLOR)
    .setDescription(description);
}

/**
 * Supprime tous les messages du salon pour éviter les doublons.
 * Utilise le bulk delete (≤ 14 jours) puis suppression individuelle pour les plus anciens.
 */
async function purgeChannel(channel) {
  console.log("[reglement] Suppression des anciens messages...");

  let deleted = 0;
  let hasMore = true;
  let lastId = undefined;

  while (hasMore) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000; // 14 jours en ms
    const recent = messages.filter((m) => m.createdTimestamp > cutoff);
    const old = messages.filter((m) => m.createdTimestamp <= cutoff);

    // Bulk delete pour les messages récents (≥ 2 messages requis par Discord)
    if (recent.size >= 2) {
      await channel.bulkDelete(recent, true);
      deleted += recent.size;
    } else if (recent.size === 1) {
      await recent.first().delete();
      deleted += 1;
    }

    // Suppression individuelle pour les messages anciens
    for (const msg of old.values()) {
      try {
        await msg.delete();
        deleted += 1;
      } catch {
        // Message déjà supprimé ou inaccessible — on continue
      }
      // Respecter le rate limit Discord
      await new Promise((r) => setTimeout(r, 300));
    }

    // Si on a récupéré moins de 100 messages, on a tout parcouru
    if (messages.size < 100) {
      hasMore = false;
    } else {
      lastId = messages.last().id;
    }
  }

  console.log(`[reglement] ${deleted} message(s) supprimé(s).`);
}

async function main() {
  loadWorkerEnv();

  const token = requireEnv("DISCORD_TOKEN");
  const guildId = requireEnv("GUILD_ID");

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  try {
    await client.login(token);
    console.log("[reglement] Bot connecté.");

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(REGLEMENT_CHANNEL_ID);

    if (
      !channel ||
      !channel.isTextBased() ||
      channel.isDMBased() ||
      (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
    ) {
      throw new Error(`Salon introuvable ou non textuel : ${REGLEMENT_CHANNEL_ID}`);
    }

    // Vérification des permissions
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const permissions = channel.permissionsFor(botMember);
    const required = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages,
    ];
    const missing = required.filter((p) => !permissions?.has(p));
    if (missing.length > 0) {
      throw new Error(`Permissions manquantes sur le salon : ${missing.join(", ")}`);
    }

    // Suppression du message précédent (uniquement celui-ci, pas les autres)
    try {
      const old = await channel.messages.fetch(LAST_MESSAGE_ID);
      await old.delete();
      console.log(`[reglement] Message ${LAST_MESSAGE_ID} supprimé.`);
    } catch (err) {
      console.warn(`[reglement] Impossible de supprimer ${LAST_MESSAGE_ID} : ${err.message}`);
    }

    // Message 1 : l'embed du règlement seul
    const embedMsg = await channel.send({ embeds: [buildReglementEmbed()] });
    console.log(`[reglement] Embed envoyé — message ${embedMsg.id}`);

    // Message 2 : ping juste en dessous, hors embed pour qu'il fonctionne réellement
    const pingMsg = await channel.send({
      content: `<@&${LOS_ESPERADOS_ROLE_ID}>`,
      allowedMentions: { roles: [LOS_ESPERADOS_ROLE_ID] },
    });
    console.log(`✅ Ping envoyé — message ${pingMsg.id}`);
  } finally {
    client.destroy();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
