/**
 * Rendu unique des logs du salon tickets.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE
 * ────────────────────────────────────────────────────────────────────────────
 * Six endroits postaient dans ce salon, chacun avec sa palette, ses emojis et
 * sa mise en page : « 📋 Décision Recrutement », « 🧾 Ticket fermé »,
 * « 🔗 Liaison » avec un pied de page « Discord Worker »… Résultat, un salon
 * sans identité où rien ne se repère.
 *
 * Le défaut le plus visible venait des champs `inline` : Discord les range par
 * TROIS. Avec 4 ou 5 champs, la dernière ligne restait orpheline et l'embed
 * paraissait bancal. On abandonne donc les champs pour les informations
 * courtes : elles vont dans la description, une par ligne, toujours alignées
 * quel que soit leur nombre.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * RÈGLES
 * ────────────────────────────────────────────────────────────────────────────
 * · La COULEUR porte le sens (réussite / échec / attention), jamais la déco.
 * · Le SUJET (candidat, plaignant…) est en `author` avec son avatar : c'est ce
 *   qu'on cherche en premier en parcourant un salon de logs.
 * · Les liens sont des liens markdown, jamais des URL brutes.
 * · Pied de page unique, pour que le salon ait une signature.
 */

import { EmbedBuilder } from "discord.js";

/** Le sens de l'événement, pas sa couleur : le mapping est décidé ici. */
export type LogTone = "success" | "danger" | "warning" | "info" | "neutral";

const TONE_COLOR: Record<LogTone, number> = {
  success: 0x3ba55d, // décision favorable, action aboutie
  danger: 0xed4245, // refus, suppression, échec
  warning: 0xfaa61a, // à surveiller, action manuelle
  info: 0x5865f2, // information neutre (liaison, envoi)
  neutral: 0x6b7280, // trace sans enjeu
};

const FOOTER = "Los Esperados • Tickets";

/** Une ligne « libellé → valeur » de la description. */
export type LogLine = { label: string; value: string | null | undefined };

/** Filtre les lignes vides pour ne jamais afficher un libellé sans valeur. */
function renderLines(lines: (LogLine | null | undefined | false)[]): string {
  return lines
    .filter((l): l is LogLine => Boolean(l))
    .map((l) => {
      const v = String(l.value ?? "").trim();
      return v ? `**${l.label}** · ${v}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

export function buildTicketLog(opts: {
  tone: LogTone;
  /** Sans emoji : il est ajouté par l'appelant s'il en veut un. */
  title: string;
  /** Personne concernée — mise en avant avec son avatar. */
  subject?: { name: string; iconUrl?: string | null } | null;
  /** Informations courtes, une par ligne. Préférer ceci aux champs. */
  lines?: (LogLine | null | undefined | false)[];
  /** Phrase libre affichée sous les lignes (explication, motif…). */
  note?: string | null;
  /** Titre du bloc `note`, pour l'introduire. */
  noteLabel?: string | null;
  /** Ajoutés en bas ; réservés aux textes longs qui méritent leur encadré. */
  panelUrl?: string | null;
  threadId?: string | null;
  /** Avatar affiché en vignette à droite. */
  thumbnailUrl?: string | null;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(TONE_COLOR[opts.tone])
    .setTitle(opts.title)
    .setFooter({ text: FOOTER })
    .setTimestamp();

  if (opts.subject?.name) {
    embed.setAuthor({
      name: opts.subject.name,
      ...(opts.subject.iconUrl ? { iconURL: opts.subject.iconUrl } : {}),
    });
  }

  if (opts.thumbnailUrl) embed.setThumbnail(opts.thumbnailUrl);

  const blocks: string[] = [];

  const body = renderLines(opts.lines ?? []);
  if (body) blocks.push(body);

  if (opts.note?.trim()) {
    // Citation : le texte libre se distingue des lignes de données sans avoir
    // besoin d'un champ supplémentaire.
    const quoted = opts.note
      .trim()
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    blocks.push(opts.noteLabel ? `**${opts.noteLabel}**\n${quoted}` : quoted);
  }

  // Liens groupés sur une seule ligne : ils ne méritent pas un champ chacun.
  const links: string[] = [];
  if (opts.threadId) links.push(`[Salon](https://discord.com/channels/@me/${opts.threadId})`);
  if (opts.panelUrl) links.push(`[Voir sur le panel](${opts.panelUrl})`);
  if (links.length > 0) blocks.push(links.join("  •  "));

  if (blocks.length > 0) embed.setDescription(blocks.join("\n\n"));

  return embed;
}

/** Mention cliquable d'un salon — plus lisible qu'un identifiant brut. */
export function channelMention(id: string | null | undefined): string | null {
  return id ? `<#${id}>` : null;
}

/** Mention d'un membre, ou repli lisible quand on ne le connaît pas. */
export function userMention(id: string | null | undefined, fallback = "—"): string {
  return id ? `<@${id}>` : fallback;
}

/** Avatar Discord d'un membre, en absolu (les embeds n'acceptent pas le relatif). */
export function avatarUrl(discordId: string | null | undefined, hash: string | null | undefined): string | null {
  if (!discordId) return null;
  // `.png` toujours : le préfixe `a_` survit à l'expiration du Nitro alors que
  // l'asset animé disparaît, et `.gif` renvoie alors un 415.
  if (hash) return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.png?size=128`;
  try {
    const idx = Number((BigInt(discordId) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return null;
  }
}
