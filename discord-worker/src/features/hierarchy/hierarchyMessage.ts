/**
 * Auto-sync d'un embed "Hiérarchie Los Esperados" dans un channel Discord
 * dédié. Le bot édite tout seul le message à intervalles réguliers.
 *
 * Le contenu est rendu comme UN SEUL bloc markdown (```md ... ```) avec
 * chaque ligne paddée par des full-width spaces (U+3000) pour être
 * visuellement centrée dans l'embed.
 *
 * Note : les noms sont en TEXTE (pas en mention Discord cliquable) car
 * les mentions ne sont pas rendues à l'intérieur des code blocks.
 */

import type { Client as DiscordClient, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { toFamilyCuid } from "../../lib/family-id.js";

const HIERARCHY_CHANNEL_ID = "1312846003358924877";
const FAMILY_SLUG = "esperados";
const LOGO_URL = "https://losesperados.fr/branding/los-esperados.png";

// === Rôles ===
// Catégories ordonnées de la plus haute à la plus basse :
//   CHEF_EM = Chef État-Major (Consejero) — section dédiée car c'est le
//   "chef des EM", au-dessus des autres grades État-Major.
type GradeCategory = "CHEF_EM" | "ETAT_MAJOR" | "WL3" | "WL4";
const GRADE_ROLE_IDS_ORDERED: ReadonlyArray<{ roleId: string; label: string; emoji: string; category: GradeCategory }> = [
  { roleId: "1429607761720770623", label: "Chef famille", emoji: "👑", category: "ETAT_MAJOR" },
  { roleId: "1312845999739375710", label: "Général",      emoji: "🎖️", category: "ETAT_MAJOR" },
  { roleId: "1312845999366209686", label: "Consejero",    emoji: "📜", category: "CHEF_EM"    },
  { roleId: "1312845999366209685", label: "Comandante",   emoji: "🎯", category: "ETAT_MAJOR" },
  { roleId: "1312845999366209684", label: "Coronel",      emoji: "🪖", category: "ETAT_MAJOR" },
  { roleId: "1408485173527445627", label: "Mayor",        emoji: "⚔️", category: "WL3" },
  { roleId: "1312845999366209681", label: "Capitan",      emoji: "🛡️", category: "WL3" },
  { roleId: "1312845999366209680", label: "Teniente",     emoji: "🏹", category: "WL3" },
  { roleId: "1312845999366209679", label: "Subteniente",  emoji: "🪶", category: "WL3" },
  { roleId: "1312845999366209678", label: "Veterano",     emoji: "🦅", category: "WL4" },
  { roleId: "1312845999366209677", label: "Caporal",      emoji: "🎗️", category: "WL4" },
  { roleId: "1312845999340781649", label: "Asesino",      emoji: "🗡️", category: "WL4" },
  { roleId: "1312845999340781648", label: "Guardia",      emoji: "⚖️", category: "WL4" },
  { roleId: "1312845999340781647", label: "Soldato",      emoji: "🔫", category: "WL4" },
  { roleId: "1408492476351778836", label: "Novato",       emoji: "🌱", category: "WL4" },
];

const DEMOTE_ROLE_ID    = "1340837563753304075";
const BLACKLIST_ROLE_ID = "1338901141873758288";
const RESERVIST_ROLE_ID = "1312845999366209682";
const CHEF_FAMILLE_ROLE_ID      = "1429607761720770623";
const SOUS_CHEF_FAMILLE_ROLE_ID = "1488610892282335314";
const HIDDEN_GRADE_ROLE_IDS = new Set<string>([
  CHEF_FAMILLE_ROLE_ID,
  "1312845999739375710", // Général (n'apparaît que comme annotation Sous-Chef)
]);

/**
 * Membres retirés de l'embed hiérarchie.
 *
 * Ils gardent leur grade, leurs rôles Discord et leur autorité réelle : on ne
 * fait que ne plus les afficher. Miroir de `HIDDEN_MEMBER_DISCORD_IDS` côté
 * panel (`src/lib/staff/member-scope.ts`) — les deux listes doivent rester
 * alignées, le worker ne partageant pas le code du site.
 */
const HIDDEN_DISCORD_IDS: ReadonlySet<string> = new Set([
  "802539543274323968", // Nelson Meledo — masqué sur demande (03/08/2026)
]);

const EL_PADRINO_DISCORD_IDS: ReadonlyArray<string> = [];
const JEFE_DE_JEFES_DISCORD_IDS: ReadonlyArray<string> = [
  "408937062838829056", // Denis Brouillard
];

// === Lisibilité mobile ===
// Plus de padding full-width — sur mobile l'embed est étroit (~320 px) et
// les `　` (U+3000, ~2× espace ASCII) bouffaient toute la largeur → texte
// illisible qui wrappait n'importe comment. On laisse le contenu aligné
// à gauche partout. Les séparateurs avec wings ▰ donnent suffisamment
// de structure visuelle sans avoir besoin d'indenter les pings.
const INDENT_CONTENT = ""; // pas d'indentation : flush-left, lisible mobile

// === Séparateurs et titre ===
// Wings courtes pour rester sur une seule ligne même sur petit écran.

const TITLE_LINE     = "🏛️  LOS ESPERADOS  🏛️";
const SUBTITLE_LINE  = "✦・HIÉRARCHIE OFFICIELLE・✦";
const SEP_CHEF       = "▰▰▰▰  👑  CHEF FAMILLE  👑  ▰▰▰▰";
const SEP_SOUS_CHEF  = "▰▰▰  ⚔️  SOUS-CHEF FAMILLE  ⚔️  ▰▰▰";
const SEP_CHEF_EM    = "▰▰▰  📜  CHEF ÉTAT-MAJOR  📜  ▰▰▰";
const SEP_ETAT_MAJOR = "▰▰▰▰  🎖️  ÉTAT-MAJORS  🎖️  ▰▰▰▰";
const SEP_WL3        = "▰▰▰▰▰  ⭐  WL-3  ⭐  ▰▰▰▰▰";
const SEP_WL4        = "▰▰▰▰▰  ⚜️  WL-4  ⚜️  ▰▰▰▰▰";
const SEP_RESERV     = "▰▰▰▰  💤  RÉSERVISTES  💤  ▰▰▰▰";

const log = (msg: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ event: msg, scope: "hierarchy", ...data, timestamp: new Date().toISOString() }));

const logError = (msg: string, err: unknown, data: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event: msg, scope: "hierarchy", error: err instanceof Error ? err.message : String(err), ...data, timestamp: new Date().toISOString() }));

// === Data loading ===

type MemberRow = {
  rpName: string | null;
  discordId: string | null;
  discordRoleIds: string[];
  /** "👑 El Padrino", "🎖️ Jefe de Jefes", "🎖️ Général", etc. */
  title?: string;
  sortKey?: number;
};

async function loadHierarchy(prisma: PrismaClient): Promise<{
  chefFamille: MemberRow[];
  sousChefFamille: MemberRow[];
  byGrade: Map<string, MemberRow[]>;
  reservists: MemberRow[];
}> {
  const family = await prisma.family.findUnique({
    where: { slug: FAMILY_SLUG },
    select: { id: true },
  });
  if (!family) {
    return { chefFamille: [], sousChefFamille: [], byGrade: new Map(), reservists: [] };
  }

  const members = await prisma.member.findMany({
    where: {
      familyId: family.id,
      isActive: true,
      isGhost: false,
      discordId: { not: null },
      NOT: [
        { discordRoleIds: { has: DEMOTE_ROLE_ID } },
        { discordRoleIds: { has: BLACKLIST_ROLE_ID } },
      ],
    },
    select: { rpName: true, discordId: true, discordRoleIds: true },
    orderBy: { rpName: "asc" },
  });

  const byGrade = new Map<string, MemberRow[]>();
  for (const entry of GRADE_ROLE_IDS_ORDERED) byGrade.set(entry.roleId, []);
  const reservists: MemberRow[] = [];
  const chefFamille: MemberRow[] = [];
  const sousChefFamille: MemberRow[] = [];

  for (const m of members) {
    const did = m.discordId ?? "";

    // Masqué : n'entre dans aucune section de l'embed.
    if (HIDDEN_DISCORD_IDS.has(did)) continue;

    if (EL_PADRINO_DISCORD_IDS.includes(did)) {
      chefFamille.push({ ...m, title: "👑 El Padrino", sortKey: 0 });
      continue;
    }
    if (JEFE_DE_JEFES_DISCORD_IDS.includes(did)) {
      chefFamille.push({ ...m, title: "🎖️ Jefe de Jefes", sortKey: 1 });
      continue;
    }

    const roles = new Set(m.discordRoleIds ?? []);

    if (roles.has(CHEF_FAMILLE_ROLE_ID)) {
      chefFamille.push({ ...m, title: "👑 Chef famille", sortKey: 2 });
      continue;
    }

    if (roles.has(SOUS_CHEF_FAMILLE_ROLE_ID)) {
      let actualGrade: string | null = null;
      let gradeEmoji = "";
      for (const entry of GRADE_ROLE_IDS_ORDERED) {
        if (entry.roleId === CHEF_FAMILLE_ROLE_ID) continue;
        if (roles.has(entry.roleId)) {
          actualGrade = entry.label;
          gradeEmoji = entry.emoji;
          break;
        }
      }
      const title = actualGrade ? `${gradeEmoji} ${actualGrade}` : undefined;
      sousChefFamille.push({ ...m, title });
      continue;
    }

    if (roles.has(RESERVIST_ROLE_ID)) {
      reservists.push(m);
      continue;
    }

    let assigned: string | null = null;
    for (const entry of GRADE_ROLE_IDS_ORDERED) {
      if (roles.has(entry.roleId)) { assigned = entry.roleId; break; }
    }
    if (assigned) byGrade.get(assigned)!.push(m);
  }

  chefFamille.sort((a, b) => {
    const ka = a.sortKey ?? 99;
    const kb = b.sortKey ?? 99;
    if (ka !== kb) return ka - kb;
    return (a.rpName ?? "").localeCompare(b.rpName ?? "");
  });

  return { chefFamille, sousChefFamille, byGrade, reservists };
}

// === Rendering ===

function memberLine(_client: DiscordClient, m: MemberRow): string {
  if (m.discordId) return `${INDENT_CONTENT}<@${m.discordId}>`;
  const name = (m.rpName ?? "").trim() || "Membre inconnu";
  return `${INDENT_CONTENT}@${name}`;
}

function gradeBlock(
  client: DiscordClient,
  emoji: string,
  label: string,
  members: MemberRow[],
): string[] {
  const lines = [`${INDENT_CONTENT}${emoji} ${label}`];
  if (members.length === 0) {
    lines.push(`${INDENT_CONTENT}— Aucun —`);
  } else {
    for (const m of members) lines.push(memberLine(client, m));
  }
  return lines;
}

function honorificBlock(client: DiscordClient, m: MemberRow): string[] {
  const lines: string[] = [];
  if (m.title) lines.push(`${INDENT_CONTENT}${m.title}`);
  lines.push(memberLine(client, m));
  return lines;
}

async function buildHierarchyEmbed(
  client: DiscordClient,
  prisma: PrismaClient,
): Promise<EmbedBuilder> {
  const { chefFamille, sousChefFamille, byGrade, reservists } = await loadHierarchy(prisma);

  const out: string[] = [];

  out.push(TITLE_LINE);
  out.push(SUBTITLE_LINE);
  out.push("");
  out.push("");

  // CHEF FAMILLE
  out.push(SEP_CHEF);
  out.push("");
  chefFamille.forEach((m, i) => {
    out.push(...honorificBlock(client, m));
    if (i < chefFamille.length - 1) out.push("");
  });
  out.push("");
  out.push("");

  // SOUS-CHEF FAMILLE
  out.push(SEP_SOUS_CHEF);
  out.push("");
  if (sousChefFamille.length === 0) {
    out.push(`${INDENT_CONTENT}— Aucun —`);
  } else {
    sousChefFamille.forEach((m, i) => {
      out.push(...honorificBlock(client, m));
      if (i < sousChefFamille.length - 1) out.push("");
    });
  }
  out.push("");
  out.push("");

  // CHEF ÉTAT-MAJOR (Consejero = chef des EM, au-dessus des autres EM)
  out.push(SEP_CHEF_EM);
  out.push("");
  const chefEm = GRADE_ROLE_IDS_ORDERED.filter((g) => g.category === "CHEF_EM");
  chefEm.forEach((g, i) => {
    out.push(...gradeBlock(client, g.emoji, g.label, byGrade.get(g.roleId) ?? []));
    if (i < chefEm.length - 1) out.push("");
  });
  out.push("");
  out.push("");

  // ÉTAT-MAJORS (Comandante, Coronel — Consejero exclu car déjà dans CHEF_EM)
  out.push(SEP_ETAT_MAJOR);
  out.push("");
  const em = GRADE_ROLE_IDS_ORDERED.filter(
    (g) => g.category === "ETAT_MAJOR" && !HIDDEN_GRADE_ROLE_IDS.has(g.roleId),
  );
  em.forEach((g, i) => {
    out.push(...gradeBlock(client, g.emoji, g.label, byGrade.get(g.roleId) ?? []));
    if (i < em.length - 1) out.push("");
  });
  out.push("");
  out.push("");

  // WL-3
  out.push(SEP_WL3);
  out.push("");
  const wl3 = GRADE_ROLE_IDS_ORDERED.filter((g) => g.category === "WL3");
  wl3.forEach((g, i) => {
    out.push(...gradeBlock(client, g.emoji, g.label, byGrade.get(g.roleId) ?? []));
    if (i < wl3.length - 1) out.push("");
  });
  out.push("");
  out.push("");

  // WL-4
  out.push(SEP_WL4);
  out.push("");
  const wl4 = GRADE_ROLE_IDS_ORDERED.filter((g) => g.category === "WL4");
  wl4.forEach((g, i) => {
    out.push(...gradeBlock(client, g.emoji, g.label, byGrade.get(g.roleId) ?? []));
    if (i < wl4.length - 1) out.push("");
  });
  out.push("");
  out.push("");

  // RÉSERVISTES
  out.push(SEP_RESERV);
  out.push("");
  if (reservists.length === 0) {
    out.push(`${INDENT_CONTENT}— Aucun —`);
  } else {
    for (const m of reservists) out.push(memberLine(client, m));
  }

  // Pas de code block (sinon Discord affiche un bouton "Copier"). Texte
  // normal flush-left, mentions Discord cliquables. Plus de ZWSP en début
  // de description : il n'avait de sens qu'avec les FW-spaces de l'ancien
  // padding que Discord aurait trimés, ce qui n'est plus le cas.
  let content = out.join("\n");

  // Limite description Discord : 4096 chars. Si on déborde, on truncate.
  if (content.length > 4096) content = content.slice(0, 4096);

  const totalMembers =
    chefFamille.length +
    sousChefFamille.length +
    reservists.length +
    Array.from(byGrade.values()).reduce((s, arr) => s + arr.length, 0);

  return new EmbedBuilder()
    .setAuthor({ name: "Famille — Los Esperados", iconURL: LOGO_URL })
    .setThumbnail(LOGO_URL)
    .setColor(0x9b2335)
    .setDescription(content)
    .setTimestamp()
    .setFooter({
      text: `Los Esperados  •  ${totalMembers} membre${totalMembers > 1 ? "s" : ""} actif${totalMembers > 1 ? "s" : ""}  •  Mis à jour automatiquement`,
      iconURL: LOGO_URL,
    });
}

/**
 * Sync l'embed dans le channel hiérarchie. Édite le message existant si
 * possible, sinon en crée un nouveau et stocke son ID dans DiscordConfig.
 *
 * Idempotent : appeler plusieurs fois est sûr.
 */
let isSyncingHierarchy = false;

export async function syncHierarchyMessage(
  client: DiscordClient,
  prisma: PrismaClient,
): Promise<{ updated: boolean; messageId: string | null }> {
  if (isSyncingHierarchy) {
    console.warn("[HIERARCHY] skip: sync précédente encore en cours");
    return { updated: false, messageId: null };
  }
  isSyncingHierarchy = true;
  try {
    return await syncHierarchyMessageInner(client, prisma);
  } finally {
    isSyncingHierarchy = false;
  }
}

async function syncHierarchyMessageInner(
  client: DiscordClient,
  prisma: PrismaClient,
): Promise<{ updated: boolean; messageId: string | null }> {
  try {
    const channel = await client.channels.fetch(HIERARCHY_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      logError("hierarchy_channel_invalid", `Channel ${HIERARCHY_CHANNEL_ID} introuvable ou non textuel`);
      return { updated: false, messageId: null };
    }

    const embed = await buildHierarchyEmbed(client, prisma);

    // Convention CUID : FAMILY_SLUG est une valeur d'entree, jamais une cle
    // de base. Sans cette resolution, ce bloc creait une SECONDE ligne
    // DiscordConfig indexee sur le slug — et repostait donc un nouveau message
    // de hierarchie au lieu d'editer l'existant.
    const familyCuid = await toFamilyCuid(prisma, FAMILY_SLUG);

    const config = await prisma.discordConfig.findUnique({
      where: { familyId: familyCuid },
      select: { hierarchyMessageId: true },
    });
    let messageId = config?.hierarchyMessageId ?? null;

    if (messageId) {
      try {
        const existing = await (channel as TextChannel).messages.fetch(messageId);
        await existing.edit({ embeds: [embed] });
        log("hierarchy_synced", { messageId, action: "edit" });
        return { updated: true, messageId };
      } catch {
        log("hierarchy_message_gone", { messageId });
        messageId = null;
      }
    }

    const sent = await (channel as TextChannel).send({ embeds: [embed] });
    await prisma.discordConfig.upsert({
      where: { familyId: familyCuid },
      create: { familyId: familyCuid, hierarchyMessageId: sent.id },
      update: { hierarchyMessageId: sent.id },
    });
    log("hierarchy_synced", { messageId: sent.id, action: "create" });
    return { updated: true, messageId: sent.id };
  } catch (err) {
    logError("hierarchy_sync_failed", err);
    return { updated: false, messageId: null };
  }
}
