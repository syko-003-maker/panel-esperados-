/**
 * LYG Warn Poller — stockage DB + notifications uniquement pour les nouveaux warns
 *
 * Logique :
 * 1. Fetch LYG /warns/:steamId pour chaque membre actif (séquentiel, 300ms délai)
 * 2. Pour chaque warn reçu : upsert en DB via la clé unique (steamId+warnDate+type)
 * 3. Si le warn est nouveau (non encore notifié) → embed Discord + marqué notified=true
 * 4. Pas d'appel LYG si rate-limité : on arrête proprement et on réessaie au prochain cycle
 */

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import type { PrismaClient } from "@prisma/client";
import { IDS } from "../ids.js";
import { parseLygWarnDate } from "../utils/parseLygWarnDate.js";

const LYG_BASE_URL = process.env.LYG_BASE_URL ?? "https://api.lyg.fr/api";
const LYG_TOKEN    = process.env.LYG_TOKEN ?? "";

type LygWarnRaw = {
  reason: string;
  type: string;
  date: string;
  expired: boolean;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Bug fix : avant on récupérait `limit=10`, ce qui plafonnait l'ingestion DB
// à 10 warns/membre. Pour des membres avec un long historique (ex Alexei
// 44 warns LYG, Moha 27, Warren 26), la grosse majorité de leurs warns
// n'étaient JAMAIS écrits en DB → page /staff/warns vide ou tronquée.
// 50 = couvre 95% des cas observés (max actuel = 44). Au-delà on perd
// vraiment l'utilité d'avoir des warns 2018 archivés.
const POLLER_FETCH_LIMIT = 50;

async function fetchWarnsFromLyg(steamId: string): Promise<{ total: number; warns: LygWarnRaw[] } | null | "rate_limited"> {
  try {
    const res = await fetch(`${LYG_BASE_URL}/warns/${steamId}?limit=${POLLER_FETCH_LIMIT}&page=1`, {
      // LYG a basculé son auth de Bearer vers X-API-Token (printemps 2026).
      headers: { "X-API-Token": LYG_TOKEN, Accept: "application/json" },
      signal: AbortSignal.timeout(7_000),
    } as RequestInit);

    // Track call vers le panel
    const { trackLygCall } = await import("../lib/lyg-track.js");
    trackLygCall(res.ok, res.status, "/api/warns/:steamId");

    if (res.status === 429) return "rate_limited";
    if (!res.ok) return null;

    const json = await res.json().catch(() => null);
    if (!json) return null;

    return {
      total: json.total ?? 0,
      warns: (json.data ?? []) as LygWarnRaw[],
    };
  } catch {
    return null;
  }
}

let isPollingLygWarns = false;

export async function pollLygWarns(client: Client, prisma: PrismaClient): Promise<void> {
  if (isPollingLygWarns) {
    console.warn("[lygWarnPoller] skip: poll précédent encore en cours");
    return;
  }
  isPollingLygWarns = true;
  try {
    await pollLygWarnsInner(client, prisma);
  } finally {
    isPollingLygWarns = false;
  }
}

async function pollLygWarnsInner(client: Client, prisma: PrismaClient): Promise<void> {
  const logsChannelId = process.env.DISCORD_LOGS_CHANNEL_ID;
  if (!LYG_TOKEN) return;

  const DEMOTE_ROLE_ID    = "1340837563753304075";
  const BLACKLIST_ROLE_ID = "1338901141873758288";
  const RESERVIST_ROLE_ID = "1312845999366209682";
  const CHEF_ROLE_ID      = IDS.CHEF_FAMILLE_ROLE_ID      as string | null;
  const SOUS_CHEF_ROLE_ID = IDS.SOUS_CHEF_FAMILLE_ROLE_ID as string | null;

  // Liste des rôles de grade Famille (= membres "actifs" éligibles au poll).
  // On filtre via discordRoleIds, source de vérité, plutôt que par
  // Member.gradeLevel — ce dernier n'est pas re-syncé après un retrait de
  // DEMOTE ou un legacy import sans grade. Bug observé : Tony, Alexei, Karim
  // et autres membres actifs restaient invisibles au poller alors qu'ils
  // recevaient des warns IG.
  // (Réserviste exclu plus bas via NOT, on ne l'inclut donc pas ici.)
  const ACTIVE_GRADE_ROLE_IDS = [
    "1429607761720770623", // Chef famille
    "1312845999739375710", // Général
    "1312845999366209686", // Consejero
    "1312845999366209685", // Comandante
    "1312845999366209684", // Coronel
    "1408485173527445627", // Mayor
    "1312845999366209681", // Capitan
    "1312845999366209680", // Teniente
    "1312845999366209679", // Subteniente
    "1312845999366209678", // Veterano
    "1312845999366209677", // Caporal
    "1312845999340781649", // Asesino
    "1312845999340781648", // Guardia
    "1312845999340781647", // Soldato
    "1408492476351778836", // Novato
    // Pas de rôles "membre basique" (Nutella, etc.) : ces membres ne sont
    // pas soumis aux règles warns/sanctions, on ne poll pas leurs warns IG.
  ];

  // Construire les filtres d'exclusion dynamiquement (chef/sous-chef peuvent être null si non configurés)
  const excludeRoles = [
    { discordRoleIds: { has: DEMOTE_ROLE_ID    } },
    { discordRoleIds: { has: BLACKLIST_ROLE_ID } },
    { discordRoleIds: { has: RESERVIST_ROLE_ID } },
    ...(CHEF_ROLE_ID      ? [{ discordRoleIds: { has: CHEF_ROLE_ID      } }] : []),
    ...(SOUS_CHEF_ROLE_ID ? [{ discordRoleIds: { has: SOUS_CHEF_ROLE_ID } }] : []),
  ];

  const members = await prisma.member.findMany({
    where: {
      steamId: { not: null },
      isActive: true,
      discordRoleIds: { hasSome: ACTIVE_GRADE_ROLE_IDS },
      NOT: excludeRoles,
    },
    // createdAt = date d'arrivée du membre dans NOTRE DB (recrutement / 1ère
    // sync). Tout warn ANTÉRIEUR à cette date a été pris avant qu'il soit
    // chez nous → on ne notifie pas (mais on stocke quand même en DB pour
    // garder l'historique consultable côté /staff/warns).
    select: { id: true, steamId: true, rpName: true, discordId: true, grade: true, createdAt: true },
  });

  const siteBase = process.env.NEXTAUTH_URL ?? "https://losesperados.fr";

  for (const member of members) {
    if (!member.steamId) continue;

    const result = await fetchWarnsFromLyg(member.steamId);

    if (result === "rate_limited") {
      console.warn("[lygWarnPoller] Rate limit LYG — arrêt du cycle");
      break;
    }
    if (!result) { await sleep(10_000); continue; }

    // Upsert chaque warn en DB, récupérer les nouveaux
    for (const w of result.warns) {
      // Parse via le helper pour corriger le bug LYG (suffixe Z abusif sur
      // du Brussels local). Sans ça, les warnDate sont stockés avec +1h ou
      // +2h selon DST, ce qui décale les embeds Discord et les vues panel.
      const warnDate = parseLygWarnDate(w.date);
      if (!warnDate) continue;

      // Normalisation du type (minuscule) : la dédup repose sur la contrainte
      // unique (steamId, warnDate, type) ; sans ça "Ban"/"ban" ou "Warn"/"warn"
      // créent des doublons. Valeur normalisée utilisée pour findUnique ET create.
      const warnType = String(w.type ?? "").toLowerCase().trim();

      const existing = await prisma.lygWarn.findUnique({
        where: {
          steamId_warnDate_type: {
            steamId: member.steamId,
            warnDate,
            type: warnType,
          },
        },
        select: { id: true, notified: true },
      });

      if (!existing) {
        // Critère de notification : le warn doit être POSTÉRIEUR à l'arrivée
        // du membre dans notre DB (createdAt = recrutement / 1ère sync).
        // Tous les warns pris IG AVANT son recrutement sont stockés en DB
        // pour l'historique mais ne déclenchent PAS de notification Discord
        // — sinon à chaque recrutement on spamme le salon avec d'éventuels
        // warns datant d'avant l'arrivée du mec dans la famille.
        // Marge de 5 min pour absorber le décalage entre warn LYG et write
        // côté DB.
        const isAfterJoin =
          warnDate.getTime() >= member.createdAt.getTime() - 5 * 60_000;

        await prisma.lygWarn.create({
          data: {
            memberId: member.id,
            steamId: member.steamId,
            reason: w.reason,
            type: warnType,
            warnDate,
            expired: w.expired,
            notified: !isAfterJoin, // warns pré-recrutement = notifié d'emblée (= jamais notifier)
          },
        });

        // Envoyer notification Discord uniquement pour les warns post-recrutement
        if (logsChannelId && isAfterJoin) {
          try {
            const channel = await client.channels.fetch(logsChannelId).catch(() => null);
            if (channel?.isTextBased?.()) {
              const memberMention = member.discordId ? `<@${member.discordId}>` : `**${member.rpName ?? "Inconnu"}**`;
              const profileUrl = `${siteBase}/staff/members/by-discord/${member.discordId}`;
              // Timestamp Discord natif — s'affiche dans le fuseau horaire de chaque utilisateur
              const warnDateRelative = `<t:${Math.floor(warnDate.getTime() / 1000)}:R>`;
              const warnDateFull     = `<t:${Math.floor(warnDate.getTime() / 1000)}:f>`;

              const typeLower = w.type.toLowerCase();
              const isBan  = typeLower.includes("ban");
              const isKick = typeLower.includes("kick");

              // Palette : rouge vif ban, orange kick, ambre warn.
              const typeColor = isBan ? 0xdc2626 : isKick ? 0xea580c : 0xf59e0b;
              const typeEmoji = isBan ? "🔨" : isKick ? "👢" : "⚠️";
              const typeLabel = isBan ? "BANNISSEMENT" : isKick ? "KICK" : "AVERTISSEMENT";

              const totalWarns = await prisma.lygWarn.count({
                where: { memberId: member.id },
              });

              // Indicateur visuel de gravité — barre de 5 cases qui se remplit
              // au fil des warns. Plus parlant qu'un simple "1 — Premier warn".
              const sevDots = (n: number) => {
                const filled = Math.min(5, n);
                return "●".repeat(filled) + "○".repeat(5 - filled);
              };
              const sevLabel =
                totalWarns >= 5 ? "🔴 Critique"   :
                totalWarns >= 3 ? "🟠 Élevé"      :
                totalWarns >= 2 ? "🟡 Modéré"     :
                                  "🟢 Premier warn";
              const severityField = `\`${sevDots(totalWarns)}\` **${totalWarns}**\n${sevLabel}`;

              // Récupérer la photo de profil Discord ; on saute la default
              // avatar Discord (URL contient /embed/avatars/), qui rend mal
              // dans l'embed — on préfère le logo Los Esperados en fallback.
              let avatarUrl: string | null = null;
              if (member.discordId) {
                try {
                  const discordUser = await client.users.fetch(member.discordId);
                  const url = discordUser.displayAvatarURL({ size: 128 });
                  if (url && !/\/embed\/avatars\//.test(url)) {
                    avatarUrl = url;
                  }
                } catch { /* ignore si l'utilisateur est introuvable */ }
              }
              // Fallback : logo Los Esperados servi depuis le panel public.
              const thumbUrl = avatarUrl ?? `${siteBase}/branding/los-esperados.png`;

              // Bloc raison surligné — bloc code ANSI Discord pour mettre la
              // raison en évidence avec une couleur (jaune gras pour les warns,
              // rouge pour les bans/kicks).
              // Escape les backticks éventuels (rare mais possible dans une raison).
              const safeReason = String(w.reason ?? "—").replace(/`/g, "ˋ");
              const ansiColor = isBan || isKick ? "[1;31m" : "[1;33m"; // 31 rouge / 33 jaune
              const reasonBlock =
                "```ansi\n" +
                `${ansiColor}${safeReason}[0m\n` +
                "```";

              // Type IG brut (Jail / Ban24H / Kick / etc.) — utile pour
              // distinguer un Ban24H d'un Ban perm dans les logs.
              const typeIG = String(w.type ?? "—");

              const embed = new EmbedBuilder()
                .setColor(typeColor)
                .setAuthor({
                  name: member.rpName ?? "Membre inconnu",
                  iconURL: avatarUrl ?? undefined,
                })
                .setTitle(`${typeEmoji}  ${typeLabel}`)
                .setURL(member.discordId ? profileUrl : null)
                .setDescription(
                  `${memberMention}  •  ${warnDateRelative}\n\n` +
                  `**📋  Raison**\n${reasonBlock}`
                )
                .addFields(
                  { name: "🎖️  Grade",     value: member.grade ?? "—", inline: true },
                  { name: "🔧  Type IG",   value: `\`${typeIG}\``,     inline: true },
                  { name: "​",        value: "​",            inline: true }, // spacer pour aligner
                  { name: "📅  Date",      value: warnDateFull,        inline: true },
                  { name: "📊  Sévérité",  value: severityField,       inline: true },
                  { name: "​",        value: "​",            inline: true },
                )
                .setThumbnail(thumbUrl)
                .setTimestamp()
                .setFooter({ text: "Los Esperados  •  Sanction IG (LYG)" });

              if (member.discordId) {
                embed.addFields({
                  name: "​",
                  value: `▸ [**Ouvrir la fiche staff →**](${profileUrl})`,
                  inline: false,
                });
              }

              // Ping Chef Famille + Sous-Chef Famille + Etat Major
              const pingContent = [
                IDS.CHEF_FAMILLE_ROLE_ID,
                IDS.SOUS_CHEF_FAMILLE_ROLE_ID,
                IDS.ETAT_MAJOR_ROLE_ID,
              ]
                .filter(Boolean)
                .map((id: string) => `<@&${id}>`)
                .join(" ");

              await (channel as TextChannel).send({ content: pingContent || undefined, embeds: [embed] });

              // Marquer comme notifié
              await prisma.lygWarn.updateMany({
                where: { memberId: member.id, steamId: member.steamId, warnDate, type: w.type },
                data: { notified: true },
              });

              console.log(`[lygWarnPoller] Notifié → ${member.rpName} — ${w.type}: ${w.reason}`);
            }
          } catch (err) {
            console.error("[lygWarnPoller] Erreur envoi notif:", err);
          }
        }
      } else if (existing.id) {
        // Warn existant : mettre à jour le statut expired si nécessaire
        await prisma.lygWarn.update({
          where: { id: existing.id },
          data: { expired: w.expired },
        }).catch(() => {});
      }
    }

    await sleep(10_000);
  }

  console.log(`[lygWarnPoller] Cycle terminé — ${members.length} membres traités`);
}
