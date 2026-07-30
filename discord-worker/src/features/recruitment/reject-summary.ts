/**
 * Explication du refus envoyée au candidat.
 *
 * Le message était générique et le candidat repartait sans savoir pourquoi. On
 * lui restitue donc les motifs RÉELLEMENT énoncés dans son ticket, au plus près
 * des mots employés par le staff.
 *
 * ⚠️ Choix assumé : les remarques internes parviennent au candidat. Une version
 * précédente reformulait en termes neutres pour éviter ça, mais elle produisait
 * des explications vagues — voire des motifs inventés quand le ticket n'en
 * donnait pas. C'est précisément ce qu'on ne veut pas.
 *
 * Garde-fou conservé : si aucun motif n'a été énoncé, on ne dit RIEN. Mieux vaut
 * le message générique qu'une raison fabriquée.
 *
 * Tout échec est silencieux : sans IA configurée, sans messages ou sans réponse
 * du modèle, l'appelant retombe sur le message générique.
 */

import { callGroq, isGroqConfigured } from "../fun/groq.js";
import type { ArchivedMessage } from "./archive-messages.js";

/** Budget de caractères envoyé au modèle. Garde de la marge sous la fenêtre de contexte. */
const MAX_TRANSCRIPT_CHARS = 7000;

/** Au-delà, on n'envoie pas un pavé au candidat. */
const MAX_OUTPUT_CHARS = 900;

/**
 * Le modèle n'écrit PAS le message : il extrait les motifs, et le code met en
 * forme. Une consigne « si aucun motif, réponds AUCUN_MOTIF » a été essayée et
 * n'a pas tenu — sur un refus sec, le modèle a fabriqué un motif d'âge qui
 * n'existait nulle part dans le ticket. En lui demandant une liste, « aucun
 * motif » devient un tableau vide, et la règle s'applique en dur.
 */
const EXTRACT_PROMPT = `On te donne les échanges d'un ticket de recrutement refusé, pour la famille RP « Los Esperados » sur Garry's Mod.

Extrais les motifs du refus RÉELLEMENT ÉNONCÉS par le staff dans ces échanges.

Réponds UNIQUEMENT par un objet JSON de cette forme :
{"motifs": ["motif 1", "motif 2"]}

RÈGLES :
- Chaque motif est une phrase courte, concrète, au plus près de ce qui a été dit. Tu t'adresses au candidat en le tutoyant. Exemple : "Ta motivation tenait en une phrase et tu ne l'as pas développée quand on te l'a demandé."
- Tu n'extrais QUE ce qui est explicitement reproché. Pas d'interprétation, pas de déduction, pas de complément.
- Si le staff a refusé SANS donner de raison, réponds {"motifs": []}. N'invente jamais un motif plausible : ni l'âge, ni l'expérience, ni rien qui ne soit écrit noir sur blanc.
- Ne nomme aucun membre du staff. Ne mentionne ni note, ni points, ni score.
- Maximum 5 motifs.

Réponds par le JSON seul, sans texte autour.`;

type Extraction = { motifs?: unknown };

/** Extrait le tableau de motifs, tolérant au JSON entouré de texte ou de balises. */
function parseMotifs(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  let parsed: Extraction;
  try {
    parsed = JSON.parse(match[0]) as Extraction;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.motifs)) return [];
  return parsed.motifs
    .filter((m): m is string => typeof m === "string")
    .map((m) => m.trim())
    .filter((m) => m.length > 3)
    .slice(0, 5);
}

/** Transcription lisible, dans l'ordre chronologique. */
function toTranscript(messages: ArchivedMessage[]): string | null {
  const lines: string[] = [];
  for (const m of messages) {
    const parts = [m.content?.trim(), m.embedsText?.trim()].filter(Boolean);
    const text = parts.join(" — ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push(`${m.authorIsBot ? "SYSTÈME" : m.authorNameSnapshot}: ${text}`);
  }
  if (lines.length === 0) return null;

  // On tronque par la fin : la candidature et les premiers échanges portent le
  // contexte, la fin n'est souvent que la clôture.
  const transcript = lines.join("\n");
  return transcript.length > MAX_TRANSCRIPT_CHARS
    ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[…suite tronquée]"
    : transcript;
}

export async function buildRejectionExplanation(params: {
  messages: ArchivedMessage[];
  candidateName: string;
  staffNotes?: string | null;
}): Promise<string | null> {
  if (!isGroqConfigured()) return null;

  const transcript = toTranscript(params.messages);

  // Les notes du staff saisies dans le panel sont déjà une synthèse : on les
  // fournit en plus du fil, jamais à la place.
  const notes = params.staffNotes?.trim();
  if (!transcript && !notes) return null;

  const context = [
    `Candidat : ${params.candidateName}`,
    notes ? `Notes internes du staff :\n${notes}` : null,
    transcript ? `Échanges du ticket :\n${transcript}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await callGroq(
    [
      { role: "system", content: EXTRACT_PROMPT },
      { role: "user", content: context },
    ],
    // Température 0 : on veut une extraction reproductible, pas de la rédaction.
    { temperature: 0, maxTokens: 400 },
  ).catch(() => null);

  if (!out) return null;

  const motifs = parseMotifs(out);
  // Refus sans explication : le MP reste générique. Mieux vaut ne rien dire
  // qu'annoncer au candidat une raison que personne n'a formulée.
  if (motifs.length === 0) return null;

  const body =
    motifs.length === 1
      ? motifs[0]
      : motifs.map((m) => `• ${m}`).join("\n");

  return body.length > MAX_OUTPUT_CHARS
    ? body.slice(0, MAX_OUTPUT_CHARS - 1) + "…"
    : body;
}
