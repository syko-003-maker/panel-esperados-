/**
 * Embeds de la purge — présentation uniquement.
 *
 * Règles reprises de `features/logs/ticketLogEmbed.ts` :
 * · la couleur porte le sens, jamais la décoration ;
 * · les données vont en DESCRIPTION, une ligne `**Libellé** · valeur` chacune,
 *   jamais en champs — Discord les range par trois et laisse une ligne
 *   orpheline dès qu'on n'en a pas un multiple ;
 * · pied de page unique, pour que le salon ait une signature.
 *
 * Aucun identifiant technique, aucun camelCase, aucune date ISO : ce qui est
 * montré au staff doit se lire sans connaître l'intérieur du bot. Les
 * identifiants de corrélation vivent dans l'AuditLog, pas à l'écran.
 */

import { EmbedBuilder } from "discord.js";
import type { PurgeTally, ScanTally } from "./purge-plan.js";

const TONE_DANGER = 0xed4245;
const TONE_SUCCESS = 0x3ba55d;
const TONE_WARNING = 0xfaa61a;
const TONE_NEUTRAL = 0x6b7280;

const FOOTER = "Los Esperados • Nettoyage";

const nf = new Intl.NumberFormat("fr-BE");

/** Espace fine insécable entre les milliers : « 12 483 ». */
export function fmtCount(n: number): string {
  return nf.format(n);
}

/** Uniquement le relatif — « il y a 6 mois » se lit mieux qu'une date. */
function ago(ms: number | null): string | null {
  if (ms === null) return null;
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

/** « 45 s », « 12 min 30 s », « 3 h 24 ». */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m} min` : `${m} min ${r} s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} h ${String(m).padStart(2, "0")}`;
}

/** Mois au pluriel correct : « 1 mois », « 6 mois ». */
function months(n: number): string {
  return `${n} mois`;
}

function lines(rows: Array<[string, string | null | undefined] | null>): string {
  return rows
    .filter((r): r is [string, string] => Boolean(r && r[1]))
    .map(([k, v]) => `**${k}** · ${v}`)
    .join("\n");
}

// ── 1. Simulation ───────────────────────────────────────────────────────────

export function buildDryRunEmbed(params: {
  channelId: string;
  months: number;
  tally: ScanTally;
}): EmbedBuilder {
  const { channelId, tally } = params;

  const body = lines([
    ["Salon", `<#${channelId}>`],
    ["Ancienneté", `plus de ${months(params.months)}`],
    ["Messages concernés", fmtCount(tally.matched)],
    ["Messages conservés", fmtCount(tally.kept)],
    ["Plus récent concerné", ago(tally.newestMatchedAt)],
    ["Plus ancien trouvé", ago(tally.oldestFoundAt)],
  ]);

  const notes = ["🛡️ Aucun message ne sera supprimé"];
  if (tally.capReached) {
    notes.push(`Salon très volumineux : l'analyse s'est arrêtée à ${fmtCount(tally.scanned)} messages. Le comptage est partiel.`);
  }

  return new EmbedBuilder()
    .setColor(TONE_NEUTRAL)
    .setTitle("🔎 Simulation de suppression")
    .setDescription(`${body}\n\n${notes.join("\n")}`)
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

// ── 2. Confirmation ─────────────────────────────────────────────────────────

export function buildConfirmEmbed(params: {
  channelId: string;
  months: number;
  tally: ScanTally;
}): EmbedBuilder {
  const { channelId, tally } = params;

  const body = lines([
    ["Salon", `<#${channelId}>`],
    ["Seuil", `plus de ${months(params.months)}`],
    ["Suppression prévue", `${fmtCount(tally.matched)} messages`],
    ["Messages conservés", fmtCount(tally.kept)],
    ["Plus récent concerné", ago(tally.newestMatchedAt)],
  ]);

  const notes = ["⚠️ Cette action est définitive."];
  if (tally.capReached) {
    notes.push(`Salon très volumineux : seuls les ${fmtCount(tally.scanned)} messages analysés sont concernés.`);
  }

  return new EmbedBuilder()
    .setColor(TONE_DANGER)
    .setTitle("🗑️ Confirmer la suppression")
    .setDescription(`${body}\n\n${notes.join("\n")}`)
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

/** Rien à faire : ni alarme, ni bouton. */
export function buildNothingToDoEmbed(params: { channelId: string; months: number }): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(TONE_SUCCESS)
    .setTitle("✅ Rien à supprimer")
    .setDescription(
      lines([
        ["Salon", `<#${params.channelId}>`],
        ["Ancienneté", `plus de ${months(params.months)}`],
      ]) + "\n\nAucun message ne dépasse ce seuil."
    )
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

// ── 3. Suivi ────────────────────────────────────────────────────────────────

export function buildStartEmbed(params: {
  channelId: string;
  userId: string;
  months: number;
  targeted: number;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(TONE_WARNING)
    .setTitle("🗑️ Nettoyage démarré")
    .setDescription(
      lines([
        ["Salon", `<#${params.channelId}>`],
        ["Lancé par", `<@${params.userId}>`],
        ["Seuil", `plus de ${months(params.months)}`],
        ["À supprimer", `${fmtCount(params.targeted)} messages`],
      ])
    )
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

export function buildProgressEmbed(params: { channelId: string; tally: PurgeTally }): EmbedBuilder {
  const { tally } = params;
  const pct = tally.targeted > 0 ? Math.floor((tally.deleted / tally.targeted) * 100) : 100;
  const filled = Math.round(pct / 10);
  const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);

  return new EmbedBuilder()
    .setColor(TONE_NEUTRAL)
    .setTitle("🗑️ Nettoyage en cours")
    .setDescription(
      lines([
        ["Salon", `<#${params.channelId}>`],
        ["Progression", `${bar}  ${pct} %`],
        ["Supprimés", `${fmtCount(tally.deleted)} sur ${fmtCount(tally.targeted)}`],
      ])
    )
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

// ── 4. Bilan ────────────────────────────────────────────────────────────────

/** Ce qui a interrompu la purge, formulé pour un lecteur humain. */
function interruptionReason(tally: PurgeTally): string | null {
  if (tally.capReached) return "Salon trop volumineux — l'analyse a atteint sa limite.";
  if (tally.forbidden > 0 && tally.deleted === 0) return "Le bot n'a pas la permission de supprimer dans ce salon.";
  if (tally.forbidden > 0) return "Certains messages étaient protégés par les permissions du salon.";
  if (tally.failed > 0) return "Discord a refusé certaines suppressions.";
  return null;
}

export function buildReportEmbed(params: {
  channelId: string;
  userId: string;
  months: number;
  tally: PurgeTally;
  status: string;
  durationSeconds: number;
}): EmbedBuilder {
  const { tally } = params;
  const partial = tally.capReached || tally.forbidden > 0 || tally.failed > 0;
  const failed = params.status === "FAILED";

  const body = lines([
    ["Salon", `<#${params.channelId}>`],
    ["Lancé par", `<@${params.userId}>`],
    ["Ciblés", fmtCount(tally.targeted)],
    ["Supprimés", fmtCount(tally.deleted)],
    ["Déjà absents", fmtCount(tally.alreadyGone)],
    tally.forbidden > 0 ? ["Non autorisés", fmtCount(tally.forbidden)] : null,
    ["Erreurs", fmtCount(tally.failed)],
    ["Durée", fmtDuration(params.durationSeconds)],
  ]);

  const reason = interruptionReason(tally);
  const notes: string[] = [];
  if (partial && reason) {
    notes.push(`⚠️ ${reason}`);
    if (tally.capReached) notes.push("Des messages antérieurs au seuil subsistent : relancez la commande pour continuer.");
  }

  return new EmbedBuilder()
    .setColor(failed ? TONE_DANGER : partial ? TONE_WARNING : TONE_SUCCESS)
    .setTitle(failed ? "🔴 Nettoyage en échec" : partial ? "⚠️ Nettoyage interrompu" : "✅ Nettoyage terminé")
    .setDescription(notes.length > 0 ? `${body}\n\n${notes.join("\n")}` : body)
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

// ── Messages courts ─────────────────────────────────────────────────────────

export function buildRefusalEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(TONE_DANGER)
    .setTitle("⛔ Action impossible")
    .setDescription(message)
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

export function buildCanceledEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(TONE_NEUTRAL)
    .setTitle("✖️ Nettoyage annulé")
    .setDescription("Aucun message n'a été supprimé.")
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

export function buildLaunchedEmbed(channelId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(TONE_WARNING)
    .setTitle("🗑️ Nettoyage lancé")
    .setDescription(
      `Le nettoyage de <#${channelId}> a démarré.\n\nLe suivi et le bilan sont publiés dans le salon des logs.`
    )
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

/**
 * Un nettoyage tourne déjà. Refus immédiat, avant tout balayage.
 *
 * On indique QUI et DEPUIS QUAND : sans cela, l'utilisateur ne peut pas savoir
 * s'il doit attendre une minute ou une heure.
 */
export function buildBusyEmbed(params: {
  channelId: string;
  userId: string;
  startedAtMs: number;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(TONE_WARNING)
    .setTitle("⏳ Nettoyage déjà en cours")
    .setDescription(
      lines([
        ["Salon en cours", `<#${params.channelId}>`],
        ["Lancé par", `<@${params.userId}>`],
        ["Depuis", `<t:${Math.floor(params.startedAtMs / 1000)}:R>`],
      ]) +
        "\n\nVeuillez attendre la fin du nettoyage actuel avant d'en lancer un autre."
    )
    .setFooter({ text: FOOTER })
    .setTimestamp();
}
