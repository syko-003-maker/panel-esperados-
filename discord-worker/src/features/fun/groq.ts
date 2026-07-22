// Client IA du clash — API compatible OpenAI (chat/completions). Gratuit et bien
// plus généreux que le free tier Gemini → utilisé pour la vanne du bot SANS
// toucher au quota Gemini de /reglement.
//
// ⚠️ La limite qui mord chez Groq n'est PAS le nombre de requêtes (1000/jour)
// mais les TOKENS PAR JOUR (~100 000 par modèle). Comme la persona est renvoyée
// à chaque appel, on garde le prompt court ET — surtout — on enchaîne PLUSIEURS
// modèles : chacun a son propre budget quotidien, donc la chaîne multiplie le
// quota gratuit. Un 429 sur un modèle → on passe au suivant.
//
// Config env (worker .env.prod) :
//   GROQ_API_KEY / CLASH_AI_KEY   = clé du fournisseur                 [requis]
//   CLASH_AI_URL                  = URL .../chat/completions           [déf. Groq]
//   GROQ_MODEL / CLASH_AI_MODEL   = modèles séparés par des virgules   [déf. ci-dessous]
//
// Autres fournisseurs compatibles OpenAI (OpenRouter, Mistral…) : changer
// CLASH_AI_URL + CLASH_AI_KEY + CLASH_AI_MODEL.

const AI_URL = process.env.CLASH_AI_URL ?? "https://api.groq.com/openai/v1/chat/completions";

// Ordre = qualité décroissante. Chaque modèle a un budget de tokens SÉPARÉ.
const DEFAULT_MODELS = [
  "llama-3.3-70b-versatile", // meilleur compromis, pas de raisonnement
  "openai/gpt-oss-120b", // très bon en clash FR
  "qwen/qwen3.6-27b", // bon FR, capte le jargon
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant", // dernier recours : fade mais jamais muet
].join(",");

const AI_MODELS = (process.env.CLASH_AI_MODEL ?? process.env.GROQ_MODEL ?? DEFAULT_MODELS)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const aiKey = () => (process.env.CLASH_AI_KEY ?? process.env.GROQ_API_KEY ?? "").trim();

export function isGroqConfigured(): boolean {
  return Boolean(aiKey());
}

/**
 * Réglages par modèle. Les modèles « à raisonnement » (gpt-oss, qwen) écrivent
 * leur réflexion et laissent `content` VIDE si on ne la désactive pas / si le
 * budget de tokens est trop serré → on coupe le raisonnement et on leur laisse
 * de la marge.
 */
function tuningFor(model: string): { extra: Record<string, unknown>; maxTokens?: number } {
  const m = model.toLowerCase();
  if (m.includes("gpt-oss")) return { extra: { reasoning_effort: "low" }, maxTokens: 250 };
  if (m.includes("qwen")) return { extra: { reasoning_effort: "none" }, maxTokens: 250 };
  return { extra: {} };
}

export type GroqMsg = { role: "system" | "user" | "assistant"; content: string };

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

/**
 * Renvoie le texte généré, ou null si non configuré / tous les modèles en échec.
 * Essaie les modèles dans l'ordre : un 429 (quota du jour) passe au suivant.
 */
export async function callGroq(
  messages: GroqMsg[],
  opts?: { temperature?: number; maxTokens?: number; model?: string },
): Promise<string | null> {
  if (!isGroqConfigured()) return null;
  const models = opts?.model ? [opts.model] : AI_MODELS;

  for (const model of models) {
    const { extra, maxTokens } = tuningFor(model);
    try {
      const res = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Clé en header (jamais en query string : logs/proxies).
          authorization: `Bearer ${aiKey()}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts?.temperature ?? 0.9,
          max_tokens: maxTokens ?? opts?.maxTokens ?? 160,
          ...extra,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (res.status === 429) {
        console.warn(`[CLASH-AI] quota du jour atteint sur ${model} → modèle suivant`);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[CLASH-AI] HTTP", res.status, model, body.slice(0, 160));
        continue;
      }

      const data = (await res.json().catch(() => null)) as ChatResponse | null;
      const raw = data?.choices?.[0]?.message?.content;
      if (typeof raw !== "string") continue;
      // Certains modèles émettent quand même un bloc de réflexion : on l'enlève.
      const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (text) {
        if (model !== models[0]) console.log(`[CLASH-AI] réponse via le modèle de secours ${model}`);
        return text;
      }
    } catch (e: any) {
      console.error("[CLASH-AI] échec", model, ":", e?.message ?? e);
    }
  }
  return null;
}
