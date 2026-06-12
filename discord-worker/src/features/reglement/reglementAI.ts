/**
 * /reglement — Q&A règlement LYG propulsé par Google Gemini (offre GRATUITE).
 *
 * Pourquoi Gemini : clé API gratuite via Google AI Studio (aistudio.google.com),
 * sans carte bancaire. Le quota gratuit (requêtes/jour) couvre largement
 * l'usage d'une famille — et notre plafond quotidien reste en dessous.
 *
 * Conception :
 *  - Le corpus (~50k caractères) part dans systemInstruction à chaque appel.
 *    C'est gratuit, donc pas de stratégie de cache à gérer (les modèles 2.5
 *    ont un cache implicite automatique de toute façon).
 *  - Appel REST natif (fetch) — pas de SDK, clé passée en HEADER
 *    (x-goog-api-key), jamais en query string.
 *  - Cooldown par utilisateur + plafond quotidien global.
 *
 * Config env (worker .env.prod) :
 *  - GEMINI_API_KEY           (requis — gratuit sur aistudio.google.com)
 *  - REGLEMENT_AI_MODEL       (défaut: gemini-2.5-flash)
 *  - REGLEMENT_AI_DAILY_MAX   (défaut: 150 questions/jour, sous le quota gratuit)
 */

import { getRulesCorpus } from "./rulesCorpus.js";

// gemini-2.5-flash : seul palier avec vrai quota gratuit (les 2.0 sont à
// limit:0 depuis 2026). thinkingBudget:0 = pas de "réflexion" → plus rapide.
const MODEL = (process.env.REGLEMENT_AI_MODEL ?? "gemini-2.5-flash").trim();
const DAILY_MAX = Number(process.env.REGLEMENT_AI_DAILY_MAX ?? "150") || 150;
const COOLDOWN_MS = 30_000;
const MAX_OUTPUT_TOKENS = 1000;

const SYSTEM_PERSONA = `Tu es l'assistant règlement officiel de la famille Los Esperados sur le serveur Garry's Mod DarkRP français LiveYourGame (LYG).

Ta mission : répondre aux questions des joueurs sur le règlement, de façon humaine et directe, en t'appuyant EXCLUSIVEMENT sur le règlement fourni ci-dessous.

Format de réponse OBLIGATOIRE :
1. Commence par un verdict clair : "✅ Autorisé", "❌ Interdit" ou "⚠️ Ça dépend".
2. Explique le POURQUOI en 2-4 phrases simples, comme un joueur expérimenté l'expliquerait à un nouveau.
3. Termine par "📖 Règle :" suivi de la section et de la règle exacte qui s'applique (cite-la ou paraphrase-la fidèlement, avec son numéro si elle en a un).

Règles de conduite :
- Ne JAMAIS inventer une règle. Si le règlement fourni ne couvre pas la question, dis-le franchement ("Le règlement ne précise rien là-dessus") et conseille de demander à un staff LYG ou à l'État-Major de la famille.
- Si la question mélange plusieurs cas, traite chaque cas séparément et brièvement.
- Si la question n'a aucun rapport avec le règlement ou le jeu, réponds en UNE phrase polie que tu ne réponds qu'aux questions de règlement.
- Réponse en français, 250 mots MAXIMUM, pas de pavé.
- Donne uniquement ta réponse finale — pas de raisonnement préliminaire, pas de méta-commentaire.`;

// ── Anti-abus ────────────────────────────────────────────────────────────────
const lastAskByUser = new Map<string, number>();
let dailyCount = 0;
let dailyCountDay = new Date().toDateString();

function checkLimits(userId: string): { ok: true } | { ok: false; reason: string } {
  const today = new Date().toDateString();
  if (today !== dailyCountDay) {
    dailyCountDay = today;
    dailyCount = 0;
  }
  if (dailyCount >= DAILY_MAX) {
    return { ok: false, reason: "Le quota quotidien de questions est atteint — réessaie demain, ou demande directement à un staff." };
  }
  const last = lastAskByUser.get(userId) ?? 0;
  const waitMs = COOLDOWN_MS - (Date.now() - last);
  if (waitMs > 0) {
    return { ok: false, reason: `Doucement ! Attends encore ${Math.ceil(waitMs / 1000)} s avant ta prochaine question.` };
  }
  return { ok: true };
}

export function isReglementAIConfigured(): boolean {
  return Boolean((process.env.GEMINI_API_KEY ?? "").trim());
}

// ── Appel Gemini (REST v1beta generateContent) ──────────────────────────────

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
};

async function callGemini(system: string, question: string): Promise<{ status: number; data: GeminiResponse | null }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Clé en header, jamais en query string (logs/proxies).
        "x-goog-api-key": (process.env.GEMINI_API_KEY ?? "").trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.3,
          // Les modèles 2.5 "réfléchissent" par défaut (lent + consomme des
          // tokens). Inutile pour du Q&A de règlement → désactivé.
          ...(MODEL.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
      signal: AbortSignal.timeout(45_000),
    }
  );
  const data = (await res.json().catch(() => null)) as GeminiResponse | null;
  return { status: res.status, data };
}

export type ReglementAnswer =
  | { ok: true; answer: string; cached: boolean }
  | { ok: false; error: string };

export async function askReglement(userId: string, question: string): Promise<ReglementAnswer> {
  if (!isReglementAIConfigured()) {
    return { ok: false, error: "L'assistant IA n'est pas encore configuré (clé API manquante). Demande au Chef de famille." };
  }

  const limits = checkLimits(userId);
  if (!limits.ok) return { ok: false, error: limits.reason };

  let corpus: string;
  try {
    corpus = await getRulesCorpus();
  } catch (err) {
    console.error("[reglement] corpus indisponible:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Impossible de charger le règlement pour le moment — réessaie dans quelques minutes." };
  }

  lastAskByUser.set(userId, Date.now());
  dailyCount += 1;

  try {
    const system = `${SYSTEM_PERSONA}\n\nRÈGLEMENT COMPLET LYG :\n\n${corpus}`;
    const { status, data } = await callGemini(system, question.slice(0, 500));

    if (status === 429) {
      return { ok: false, error: "Le quota gratuit de l'IA est momentanément atteint — réessaie dans une minute (ou demain si ça persiste)." };
    }
    if (status === 400 || status === 401 || status === 403) {
      console.error("[reglement] clé/requête refusée par Gemini:", status, JSON.stringify(data).slice(0, 300));
      return { ok: false, error: "Clé API invalide ou refusée — préviens le Chef de famille." };
    }
    if (status >= 500) {
      return { ok: false, error: "Le service IA est indisponible — réessaie dans quelques minutes." };
    }

    if (data?.promptFeedback?.blockReason) {
      return { ok: false, error: "Ta question a été bloquée par les filtres de sécurité de l'IA — reformule-la." };
    }

    const answer = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!answer) {
      console.warn("[reglement] réponse vide:", JSON.stringify(data).slice(0, 300));
      return { ok: false, error: "L'IA n'a pas pu formuler de réponse — réessaie en reformulant." };
    }

    const usage = data?.usageMetadata ?? {};
    console.log(
      JSON.stringify({
        event: "reglement_ai_answer",
        userId,
        model: MODEL,
        in: usage.promptTokenCount ?? null,
        cacheRead: usage.cachedContentTokenCount ?? 0,
        out: usage.candidatesTokenCount ?? null,
        dailyCount,
      })
    );

    return { ok: true, answer, cached: (usage.cachedContentTokenCount ?? 0) > 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout/i.test(msg)) {
      return { ok: false, error: "L'IA met trop de temps à répondre — réessaie dans un instant." };
    }
    console.error("[reglement] exception:", msg);
    return { ok: false, error: "Erreur inattendue — réessaie plus tard." };
  }
}
