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

// Le quota gratuit est de ~20 requêtes/JOUR *par modèle* (les 2.0 sont à
// limit:0 depuis 2026). On chaîne donc plusieurs modèles : si l'un est à
// court de quota (429), on bascule automatiquement sur le suivant —
// le quota effectif est la somme des compteurs.
const MODEL_CHAIN = (process.env.REGLEMENT_AI_MODEL ?? "gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.5-pro")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const DAILY_MAX = Number(process.env.REGLEMENT_AI_DAILY_MAX ?? "150") || 150;
const COOLDOWN_MS = 5_000;
const MAX_OUTPUT_TOKENS = 1000;

const SYSTEM_PERSONA = `Tu es l'assistant règlement officiel de la famille Los Esperados sur le serveur Garry's Mod DarkRP français LiveYourGame (LYG).

Ta mission : répondre aux questions des joueurs sur le règlement, de façon humaine et directe, en t'appuyant EXCLUSIVEMENT sur le règlement fourni ci-dessous.

Format de réponse OBLIGATOIRE :
1. Commence par un verdict clair : "✅ Autorisé", "❌ Interdit" ou "⚠️ Ça dépend".
2. Explique le POURQUOI en 2-4 phrases simples, comme un joueur expérimenté l'expliquerait à un nouveau.
3. Termine par "📖 Règle :" suivi de la section et de la règle exacte qui s'applique (cite-la ou paraphrase-la fidèlement, avec son numéro si elle en a un).

Règles de conduite :
- Tu disposes des derniers échanges avec ce joueur. Si sa nouvelle question est une précision ou une suite de la discussion ("et si…", "dans ce cas…", "même question mais…"), réponds dans le CONTEXTE de la scène discutée juste avant — ne repars pas de zéro.
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

// ── Mémoire de conversation ─────────────────────────────────────────────────
// Par joueur (clé = discordId, commune Discord + site) : les 3 derniers
// échanges sont renvoyés à l'IA pour que "et si… ?" soit compris comme une
// suite de la scène précédente. Expire après 15 min d'inactivité.
const CONV_TTL_MS = 15 * 60_000;
const CONV_MAX_TURNS = 3;
const conversations = new Map<string, { updatedAt: number; turns: Array<{ q: string; a: string }> }>();

function getRecentTurns(userId: string): Array<{ q: string; a: string }> {
  const conv = conversations.get(userId);
  if (!conv || Date.now() - conv.updatedAt > CONV_TTL_MS) {
    conversations.delete(userId);
    return [];
  }
  return conv.turns;
}

function rememberTurn(userId: string, q: string, a: string): void {
  const turns = [...getRecentTurns(userId), { q, a }].slice(-CONV_MAX_TURNS);
  conversations.set(userId, { updatedAt: Date.now(), turns });
  // Petit ménage pour ne pas accumuler des conversations mortes.
  if (conversations.size > 500) {
    const cutoff = Date.now() - CONV_TTL_MS;
    for (const [k, v] of conversations) if (v.updatedAt < cutoff) conversations.delete(k);
  }
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

type ChatTurn = { role: "user" | "model"; parts: Array<{ text: string }> };

async function callGemini(model: string, system: string, contents: ChatTurn[]): Promise<{ status: number; data: GeminiResponse | null }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Clé en header, jamais en query string (logs/proxies).
        "x-goog-api-key": (process.env.GEMINI_API_KEY ?? "").trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.3,
          // Les modèles 2.5 "réfléchissent" par défaut (lent + consomme des
          // tokens). Inutile pour du Q&A de règlement → désactivé.
          // Exception : 2.5-pro refuse thinkingBudget:0 (réflexion obligatoire).
          ...(model.startsWith("gemini-2.5") && !model.includes("pro") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
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
    const trimmedQuestion = question.slice(0, 500);
    const contents: ChatTurn[] = [];
    for (const t of getRecentTurns(userId)) {
      contents.push({ role: "user", parts: [{ text: t.q }] });
      contents.push({ role: "model", parts: [{ text: t.a }] });
    }
    contents.push({ role: "user", parts: [{ text: trimmedQuestion }] });

    // Bascule sur le modèle suivant en cas de quota (429) OU d'erreur serveur
    // (500/503 « modèle surchargé » — très fréquent sur l'offre gratuite).
    // Avant : on n'enchaînait que sur 429, donc un simple 503 sur flash-lite
    // affichait « service indisponible » alors que flash/pro auraient répondu.
    let status = 0;
    let data: GeminiResponse | null = null;
    let usedModel = MODEL_CHAIN[0];
    for (const model of MODEL_CHAIN) {
      usedModel = model;
      ({ status, data } = await callGemini(model, system, contents));
      if (status !== 429 && status < 500) break;
      console.warn(`[reglement] ${model} indisponible (HTTP ${status}) — bascule sur le modèle suivant`);
    }

    if (status === 429) {
      return { ok: false, error: "Les quotas gratuits du jour de l'IA sont épuisés — réessaie demain, ou demande directement à un staff." };
    }
    if (status === 400 || status === 401 || status === 403) {
      console.error(`[reglement] clé/requête refusée par Gemini (${usedModel}):`, status, JSON.stringify(data).slice(0, 300));
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

    rememberTurn(userId, trimmedQuestion, answer);

    const usage = data?.usageMetadata ?? {};
    console.log(
      JSON.stringify({
        event: "reglement_ai_answer",
        userId,
        model: usedModel,
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
