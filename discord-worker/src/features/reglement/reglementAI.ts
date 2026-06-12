/**
 * /reglement — Q&A règlement LYG propulsé par l'API Claude (Anthropic).
 *
 * Conception coût/perf :
 *  - Le corpus (~20-25k tokens) part dans le system prompt avec
 *    cache_control ttl 1h → relu depuis le cache à ~10 % du prix. Le system
 *    est STABLE (aucun timestamp/ID dedans) pour ne jamais invalider le cache.
 *  - max_tokens borné, réponses courtes exigées par le prompt.
 *  - Cooldown par utilisateur + plafond quotidien global.
 *
 * Config env (worker .env.prod) :
 *  - ANTHROPIC_API_KEY        (requis pour activer la commande)
 *  - REGLEMENT_AI_MODEL       (défaut: claude-opus-4-8 ; mettre
 *                              claude-haiku-4-5 pour diviser le coût par ~5)
 *  - REGLEMENT_AI_DAILY_MAX   (défaut: 200 questions/jour)
 */

import Anthropic from "@anthropic-ai/sdk";
import { getRulesCorpus } from "./rulesCorpus.js";

const MODEL = (process.env.REGLEMENT_AI_MODEL ?? "claude-opus-4-8").trim();
const DAILY_MAX = Number(process.env.REGLEMENT_AI_DAILY_MAX ?? "200") || 200;
const COOLDOWN_MS = 30_000;
const MAX_TOKENS = 1000;

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

// ── Client (lazy : ne crashe pas le worker si la clé manque) ────────────────
let client: Anthropic | null = null;

export function isReglementAIConfigured(): boolean {
  return Boolean((process.env.ANTHROPIC_API_KEY ?? "").trim());
}

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ timeout: 45_000, maxRetries: 2 });
  }
  return client;
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
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        { type: "text", text: SYSTEM_PERSONA },
        {
          type: "text",
          text: `RÈGLEMENT COMPLET LYG :\n\n${corpus}`,
          // Le corpus est volumineux et stable → cache 1h : les questions
          // suivantes relisent le prefix à ~10 % du prix.
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [{ role: "user", content: question.slice(0, 500) }],
    });

    const answer = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!answer) return { ok: false, error: "L'IA n'a pas pu formuler de réponse — réessaie en reformulant." };

    const cached = (response.usage.cache_read_input_tokens ?? 0) > 0;
    console.log(
      JSON.stringify({
        event: "reglement_ai_answer",
        userId,
        model: MODEL,
        in: response.usage.input_tokens,
        cacheRead: response.usage.cache_read_input_tokens,
        cacheWrite: response.usage.cache_creation_input_tokens,
        out: response.usage.output_tokens,
        dailyCount,
      })
    );

    return { ok: true, answer, cached };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "L'IA est très sollicitée en ce moment — réessaie dans une minute." };
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("[reglement] clé API invalide");
      return { ok: false, error: "Clé API invalide — préviens le Chef de famille." };
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[reglement] API error ${err.status}:`, err.message);
      return { ok: false, error: "Le service IA a renvoyé une erreur — réessaie dans quelques minutes." };
    }
    console.error("[reglement] exception:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "Erreur inattendue — réessaie plus tard." };
  }
}
