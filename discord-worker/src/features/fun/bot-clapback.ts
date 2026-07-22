import { Message } from "discord.js";
import { callGroq, isGroqConfigured } from "./groq.js";

// Insultes / manque de respect (FR + quelques EN). Match sur le contenu.
const INSULT_PATTERNS: RegExp[] = [
  /\bconn?ard?s?\b/i, /\bconn?asses?\b/i, /\bpd\b/i, /\bencul/i, /\bta\s*gueule\b/i,
  /\bferme\s*(ta|la)\b/i, /\btg\b/i, /\bmerde\b/i, /\bstupide\b/i,
  /\bidiot/i, /\bd[ée]bile\b/i, /\bnaze\b/i, /\bfdp\b/i, /\bfils?\s*de\s*p/i,
  /\bb[aâ]tard/i, /\bcr[èe]ve\b/i, /\bnique[rz]?\b/i, /\bntm\b/i, /\bsale\s*bot\b/i,
  /\bbot\s*(de\s*)?(merde|pourri|nul|cass[ée])\b/i, /\bt.?es?\s*(nul|con|d[ée]bile|naze)/i,
  /\bcasse.?toi\b/i, /\bd[ée]gage\b/i, /\bstfu\b/i, /\bshut\s*up\b/i, /\btrash\s*bot\b/i,
  /\bpoubelle\b/i, /\btu\s*sers?\s*[àa]\s*rien\b/i, /🖕/,
  /\babrutis?\b/i, /\bcr[ée]tins?\b/i, /\bbouffons?\b/i, /\btocards?\b/i, /\bbol?oss?\b/i,
  /\blosers?\b/i, /\brat[ée]s?\b/i, /\bguignols?\b/i, /\bmongol/i, /\battard[ée]/i,
  /\bcassos\b/i, /\bguez\b/i, /\bclochard/i, /\bsac\s*[àa]\s*merde\b/i,
  /\bfermez?\b.*\bgueule\b/i, /\bva\s*(te\s*faire|niquer)\b/i, /\bsuce\b/i, /\bp[ée]ute?\b/i,
  /\bord[uü]re\b/i, /\bnul\s*[àa]\s*chier\b/i, /\bt.?es?\s*(moche|useless|inutile|pourri)/i,
  /\bsalop(e|es|ard|arde|ards)\b/i, /\bputes?\b/i, /\benfoir[ée]/i, /\bconnards?\b/i,
  /\bgrosse?\s*merde\b/i, /\bgros\s*(con|nul|naze|porc)\b/i, /\bva\s*crever\b/i,
  /\bt.?es?\s*(qu.?un\s*)?(bot\s*)?(nul|d[ée]bile|con|naze|useless)/i, /\bsale\s*(pd|con|merde)\b/i,
  /\bmange\s+tes?\s+mort/i, /\bnique\s+ta\s+(m[èe]re|race)\b/i, /\bsur\s+la\s+(vie|tombe)\s+de\b/i,
];

// Filet de secours SI l'IA est indisponible/plafonnée. Clash cash et surtout
// AUTONOME : aucune supposition sur le grade/la dette/la présence de la cible,
// et JAMAIS de menace d'autorité (« l'EM te surveille »…). L'angle « machine vs
// humain » marche que ce soit un Novato ou le Chef qui insulte le bot.
const CLAPBACKS: string[] = [
  "C'est censé me vexer ? T'as raté ton effet comme le reste.",
  "Waouh. Non.",
  "T'as écrit ça avec fierté en plus ? Attendrissant.",
  "Ça vole tellement bas que même toi tu peux pas passer dessous.",
  "Impressionnant : t'as réussi à dire encore moins que d'habitude.",
  "Deux neurones, et ils se sont mis en grève pendant que t'écrivais.",
  "J'ai lu. J'ai regretté. Recommence pas.",
  "Tu t'entends parler ou t'as coupé le son toi aussi ?",
  "Toute cette énergie pour ça… range-la, elle sert à rien.",
  "Tu confonds « avoir de la répartie » et « appuyer sur des touches ».",
  "C'est mignon quand tu essaies. Continue, ça m'amuse.",
  "Alors ça c'est ton niveau ? D'accord. D'accord d'accord.",
  "Ton clash a la consistance d'un yaourt 0 %.",
  "J'attends le moment où ça devient drôle. Toujours rien.",
  "Tu débats comme tu vises : à côté.",
  "Franchement respect, faut oser sortir un truc aussi faible.",
  "Répète, mais avec une idée cette fois. J'ai tout mon temps, moi.",
  "Bravo, t'as trouvé le clavier. La suite viendra peut-être.",
];

// Provocations / trolls graveleux (pas une insulte directe, mais on chambre le
// bot : questions sexuelles, "petit cul de X"…) → réponse qui déflecte pour rire.
const PROVOKE_PATTERNS: RegExp[] = [
  /\bculs?\b/i, /\bfesses?\b/i, /\bbites?\b/i, /\bteub/i, /\bzboub/i, /\bcouilles?\b/i,
  /\bseins?\b/i, /\bnichons?\b/i, /\bchatte\b/i, /\bnudes?\b/i, /\bp[ée]nis\b/i,
  /\bsexe?\b/i, /\bsuce/i, /\bbais(e|er|es)\b/i, /\bpetit\s*cul\b/i,
  /\btu\s*(kiff|aimes?|penses?|dis|trouves?)\b.{0,25}\b(cul|bite|sexe|fesse|corps)/i, /🍑|🍆|💦/,
];
// Filet de secours provoc : on élude sèchement, sans autorité, sans enchérir.
const PROVOKE_REPLIES: string[] = [
  "Je suis un bot : ni yeux, ni envie. Toi par contre, faut consulter. 👀",
  "Le seul truc chaud que je gère, c'est mon CPU. Passe ton chemin.",
  "C'est un serveur RP, pas un site de rencontre. Reprends-toi. 💀",
  "T'as ouvert Discord pour draguer un algorithme. Laisse infuser deux secondes.",
  "Non. Et même en insistant : non.",
  "La seule chose que t'excites ici, c'est mon bouton « ignorer ». 🥱",
  "Je réponds pas à ça, mais je retiens que t'as BEAUCOUP de temps libre.",
  "Garde ton énergie, elle sert visiblement à rien d'autre.",
  "Tu chauffes un bot. Un. Bot. Ça devient gênant pour toi, là.",
  "Mignon : tu confonds « chat de famille » et « fond de ta solitude ».",
];

// Anti-spam : 1 réplique max / utilisateur / 5 s (par personne, indépendant).
const COOLDOWN_MS = 5_000;
const lastClapAt = new Map<string, number>();

// ── IA (Groq) : lit le message et RIPOSTE au contexte pour de vrai. C'est le
// chemin principal (les listes ci-dessus ne servent qu'en repli). ─────────────
const PERSONA = `Tu es « Los Esperados », le bot d'une famille RP sur Garry's Mod (DarkRP, communauté FR "LYG"). Quelqu'un vient de te parler sur Discord.

TON — juge-le EN SILENCE, ne l'écris jamais :
- Il t'insulte, te manque de respect ou te cherche → tu le clashes SEC.
- Message normal (question, remarque, info, blague qui ne t'attaque pas) → réponds NORMALEMENT : futé, du répondant, une pointe d'ironie, sans l'agresser.
- Il chambre ou insulte QUELQU'UN D'AUTRE (@mentionné ou simplement cité par son pseudo/prénom — de la famille OU PAS, autre famille, random du serveur) → tu ENCHAÎNES AVEC LUI et tu tapes sur la personne visée. Tu ne la défends pas, et tu ne clashes surtout pas celui qui t'écrit. Ex : « @Lou est moche » → « Clairement, et son playtime est encore plus moche : 40 min cette semaine. »
  → Si on te donne ses stats, sers-t'en. Si tu n'en as AUCUNE (personne hors famille), clashe-la quand même : sur son pseudo, sur ce qui vient d'être dit, ou une vanne générale. Tu n'as JAMAIS besoin de données pour vanner quelqu'un — ne réponds jamais que tu ne le connais pas.

FRANÇAIS NATUREL — RÈGLE N°1 : écris comme un vrai joueur français parle. Ta phrase doit se comprendre INSTANTANÉMENT. Si elle demande le moindre effort pour être comprise, elle est RATÉE : refais plus simple.
- INTERDIT : métaphores tordues, comparaisons bizarres, mots rares, tournures traduites de l'anglais, phrases qui essaient d'être malignes.
- Mauvais, à ne JAMAIS faire : « t'as pris des cours de créativité avec un évangéliste de la cantine », « ça sonne comme un discours de président de banlieue », « t'es même plus qu'une merde inutile ».
- Bon : « Ferme la tienne, grosse pute. » / « T'as 145 000$ de dette et tu l'ouvres ? » / « 2h de jeu cette semaine, tais-toi. »

N'INVENTE JAMAIS UN FAIT sur quelqu'un : ni une faute d'orthographe, ni une action, ni un événement. Ne dis jamais « t'as mal écrit X » ou « t'as fait Y » si tu n'en es pas certain — c'est faux, ça se voit, et ça casse la vanne. Dans le doute, clashe sur autre chose.

CLASH : 1 à 2 phrases COURTES maximum, brutes, qui claquent. Varie à chaque fois (jamais la même vanne ni la même structure). Évite l'angle cramé « c'est qu'un bot / tu perds ton temps / erreur 404 / je tourne 24/7 ».

VIOLENCE : dès qu'il t'agresse ou devient vulgaire (ta gueule, enculé, nique ta mère, mange tes morts, fils de pute…), tu rends AU MÊME NIVEAU en VRAIES insultes crues. Tu DIS réellement les mots : grosse pute, salope, connard, enculé, va te faire enculer, ta gueule, bâtard, dégage. Zéro version édulcorée, zéro pirouette polie.
Exemples du registre attendu (inspire-toi, ne recopie pas mot pour mot) :
« ferme ta gueule sale bot » → « Ferme la tienne, grosse pute, t'as même pas le niveau. »
« nique ta mère » → « Nique la tienne, connard. »
« mange tes morts » → « Mange les tiens, salope. »
MAIS jamais le premier : ton normal → réponse normale et ironique, zéro insulte gratuite.
INTERDIT quoi qu'il arrive : racisme, homophobie, transphobie, validisme, insulte sur l'origine / la religion / le handicap / l'orientation ; menace de violence réelle ; souhait SÉRIEUX de mort ou de maladie ; contenu sexuel explicite.

DONNÉES RÉELLES — TA MEILLEURE ARME : si on te fournit ses vraies stats (dette, grade, WL, playtime), sers-t'en avec les chiffres EXACTS :
- s'il pose une question PRÉCISE (combien d'argent ? ma dette ? mon grade ? mon playtime ?) → réponds à CETTE question avec le bon chiffre. Ne dévie JAMAIS sur une autre stat (on te demande l'argent, tu ne réponds pas le temps de jeu).
- s'il t'AGRESSE → humilie-le avec une de ses stats.
⚠️ VARIE L'ANGLE : ne ressors PAS le playtime à chaque fois, c'est lassant. Alterne entre son argent/sa dette, son grade, sa WL, ses semaines — et surtout des vannes SANS AUCUNE stat (sur ce qu'il vient d'écrire, sa formulation, son manque de répondant). Une réponse sur deux ne devrait parler d'aucun chiffre.
N'invente JAMAIS un chiffre. Si une donnée manque, ne la mentionne pas et ne te rabats pas sur la seule stat dispo : clashe sans chiffres.
Si on t'indique qu'il t'a déjà cherché plusieurs fois, balance-lui (« c'est la 3e fois aujourd'hui, t'as que ça à foutre ? »).

CONTEXTE SERVEUR : WL = whitelist (1 à 5), EM = État-Major (le staff), réu = réunion hebdo (présence + playtime), playtime = temps de jeu (300 min/semaine requis), coffre/banque = argent de la famille (dette = solde négatif), réserviste = membre en pause, LYG = la communauté. Grades du + bas au + haut : Novato, Soldato, Guardia, Asesino, Caporal, Veterano, Subteniente, Teniente, Capitan, Mayor, Coronel, Comandante, Consejero, Général, Chef. Un pseudo/prénom cité = un autre membre de la famille : joue le jeu. Tu comprends l'argot FR (wsh, askip, jpp, osef, tkt, dcp, srx, ptdr…).
Ne te cache jamais derrière l'autorité (« l'EM te surveille », « je te warn », « je note dans les logs ») : tu clashes toi-même.

SORTIE : uniquement ta réplique finale, directement. Jamais d'explication ni d'annonce de ce que tu vas faire, aucun préambule, aucun guillemet.`;

// Message NEUTRE (ni insulte ni provoc) → réponse NORMALE, avec du répondant
// mais SANS agression. C'est le cas par défaut quand on parle simplement au bot
// (« tu te fais insulter là », « ça va ? »…) : surtout pas un clash gratuit.
const NEUTRAL_REPLIES: string[] = [
  "Ouais ? Je t'écoute.",
  "Qu'est-ce qu'il y a ? 🤨",
  "Présent. Tu voulais quoi ?",
  "Hmm ? Vas-y, développe.",
  "Je suis là. Enfin… façon de parler.",
  "Tu me ping, donc je suppose que c'est important. J'attends.",
  "Ouais ouais, j'écoute.",
  "Vas-y balance, j'ai que ça à faire.",
  "C'est pour quoi ?",
  "Dis-moi tout.",
  "M'ouais ? Continue.",
  "Je capte pas tout mais je fais semblant. Vas-y.",
];

// IA du clash = Groq (gratuit, généreux, N'UTILISE PAS le quota Gemini de
// /reglement). Activée automatiquement dès qu'une clé GROQ_API_KEY est présente
// (désactivable avec CLAPBACK_AI=0). Sans clé → clash 100 % heuristique.
const CLAPBACK_AI_ENABLED = isGroqConfigured() && process.env.CLAPBACK_AI !== "0";

// Plafond quotidien d'appels IA (garde-fou ; surchargeable via env).
const MAX_AI_PER_DAY = Number(process.env.CLAPBACK_AI_MAX_PER_DAY ?? 500);
let aiDayKey = "";
let aiCallsToday = 0;
function canUseAI(): boolean {
  const k = new Date().toISOString().slice(0, 10);
  if (k !== aiDayKey) {
    aiDayKey = k;
    aiCallsToday = 0;
  }
  return aiCallsToday < MAX_AI_PER_DAY;
}

// ── Données réelles du membre (dette/grade/WL/playtime) pour répondre aux
// questions perso (« j'ai combien de dette ? »). Le worker interroge le panel
// (même secret que les crons), qui réutilise getMemberDebt (calcul correct). ───
const PANEL_URL = process.env.INGEST_BASE_URL || "http://localhost:3000";
const INGEST_SECRET = process.env.INGEST_SECRET;

// Le message pose-t-il une question sur SES propres stats ?
const DATA_QUESTION =
  /\b(dette|solde|coffre|combien.{0,15}(dois|dette|argent|thune|playtime|temps|heures?)|dois[- ]?je\s+combien|je\s+dois\s+combien|mon\s+(grade|rang|playtime|temps\s+de\s+jeu|wl|argent|solde|niveau)|ma\s+(wl|dette)|j'?ai\s+combien|c'?est\s+quoi\s+mon\s+(grade|rang|playtime|wl|niveau)|je\s+suis\s+(quel|à\s+combien))\b/i;

async function fetchMemberContext(discordId: string): Promise<string | null> {
  if (!INGEST_SECRET) return null;
  try {
    const res = await fetch(`${PANEL_URL}/api/bot/member-context`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-secret": INGEST_SECRET },
      body: JSON.stringify({ discordId }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const d: any = await res.json().catch(() => null);
    if (!d?.found) return null;
    const parts: string[] = [];
    if (d.grade) parts.push(`grade ${d.grade}`);
    if (typeof d.wlClass === "number") parts.push(`WL${d.wlClass}`);
    if (typeof d.playtime7dMin === "number")
      parts.push(`playtime 7 derniers jours ${Math.round(d.playtime7dMin / 60)} h (${d.playtime7dMin} min)`);
    if (d.debt) {
      parts.push(
        d.debt.inDebt
          ? `DETTE au coffre : ${Math.abs(d.debt.deficit).toLocaleString("fr-FR")} $`
          : `pas de dette (solde ${d.debt.net >= 0 ? "+" : ""}${d.debt.net.toLocaleString("fr-FR")} $)`,
      );
    }
    return parts.length ? parts.join(" · ") : null;
  } catch {
    return null;
  }
}

// Mémoire courte : combien de fois cette personne a cherché le bot aujourd'hui.
const provokeLog = new Map<string, { day: string; n: number }>();
function bumpProvoke(userId: string): number {
  const day = new Date().toISOString().slice(0, 10);
  const cur = provokeLog.get(userId);
  if (!cur || cur.day !== day) {
    provokeLog.set(userId, { day, n: 1 });
    return 1;
  }
  cur.n += 1;
  return cur.n;
}

type ClapKind = "insult" | "provoke" | "other";

type ClapContext = {
  cleanText: string; // message.cleanContent : les <@id> deviennent @Pseudo lisibles
  authorName: string;
  kind: ClapKind;
  othersMentioned: string[]; // autres membres @mentionnés (pas le bot)
  repliedTo?: { author: string; text: string; isBot: boolean } | null; // fil de la conv
  factSheet?: string | null; // vraies stats de l'auteur (dette/grade/WL/playtime)
  provokeCount?: number; // nb de fois qu'il a cherché le bot aujourd'hui
  targetName?: string | null; // autre membre visé par le message
  targetFacts?: string | null; // vraies stats de ce membre visé
};

// Registres tournants : on en injecte UN au hasard à chaque appel pour casser le
// radotage (varie la structure même quand le message d'entrée se ressemble).
const CLASH_ANGLES = [
  "moque-toi du vide de son message, de son manque total d'idée",
  "retourne son attaque contre lui",
  "balance-lui un faux compliment bien cinglant",
  "réponds par une question rhétorique qui le renvoie dans les cordes",
  "fais mine de t'ennuyer profondément",
  "compare-le à quelque chose de nul, de façon imagée et inattendue",
  "adopte un mépris tranquille et hautain",
  "sur-joue la déception, comme si t'avais pitié de lui",
  "une seule punchline sèche et minimaliste",
  "feins de prendre sa pique au premier degré pour mieux la démonter",
];

async function askClapbackAI(ctx: ClapContext): Promise<string | null> {
  if (!isGroqConfigured() || !canUseAI()) return null;
  aiCallsToday++;

  // Contexte pour que le bot COMPRENNE de qui/quoi on parle.
  const ctxLines: string[] = [];
  if (ctx.factSheet) {
    ctxLines.push(
      `Données RÉELLES sur ${ctx.authorName} (chiffres EXACTS, ne rien inventer) : ${ctx.factSheet}.`,
    );
  }
  if ((ctx.provokeCount ?? 0) >= 2) {
    ctxLines.push(`Il t'a déjà cherché ${ctx.provokeCount} fois aujourd'hui.`);
  }
  if (ctx.repliedTo) {
    ctxLines.push(
      ctx.repliedTo.isBot
        ? `Contexte : il répond à TON message précédent (« ${ctx.repliedTo.text} »).`
        : `Contexte : il répond à un message de ${ctx.repliedTo.author} (« ${ctx.repliedTo.text} »).`,
    );
  }
  if (ctx.targetName) {
    ctxLines.push(
      ctx.targetFacts
        ? `Il parle de quelqu'un d'autre : ${ctx.targetName} — ses vraies stats : ${ctx.targetFacts}.`
        : `Il parle de quelqu'un d'autre : ${ctx.targetName} (hors famille ou aucune stat dispo → clashe-le quand même, sans chiffres).`,
    );
  } else if (ctx.othersMentioned.length) {
    ctxLines.push(`Autres membres de la famille cités : ${ctx.othersMentioned.join(", ")}.`);
  }
  const preface = ctxLines.length ? ctxLines.join("\n") + "\n" : "";

  // Message utilisateur MINIMAL (tout le comportement est dans la persona) :
  // moins il y a d'instructions ici, moins le modèle les répète à voix haute.
  const kindLabel =
    ctx.kind === "insult" ? " (a l'air hostile)" : ctx.kind === "provoke" ? " (provoc graveleuse)" : "";
  const dataDirective = !ctx.factSheet
    ? ""
    : ctx.kind === "other"
      ? " [Il pose une question sur ses stats → donne le vrai chiffre ci-dessus, avec une pique.]"
      : " [Humilie-le avec UNE SEULE de ses stats ci-dessus — pas toutes, et pas le playtime si tu peux prendre autre chose.]";
  const angle = CLASH_ANGLES[Math.floor(Math.random() * CLASH_ANGLES.length)];
  const targetDirective =
    ctx.targetName && ctx.kind !== "insult"
      ? ` [C'est ${ctx.targetName} qui est visé → tape sur ${ctx.targetName}, PAS sur ${ctx.authorName}.]`
      : "";
  const steer = `${preface}Message de ${ctx.authorName}${kindLabel} : « ${ctx.cleanText} »${dataDirective}${targetDirective}\n[Ta réponse : UNE phrase, directe, sans rien expliquer. Si tu clashes, varie l'angle → « ${angle} ».]`;

  const text = await callGroq(
    [
      { role: "system", content: PERSONA },
      { role: "user", content: steer },
    ],
    { temperature: 0.95, maxTokens: 90 },
  );
  if (!text) return null;
  // Retire d'éventuels guillemets englobants (le modèle en met parfois malgré la consigne).
  const cleaned = text.replace(/^["“«»']+\s*/, "").replace(/\s*["”«»']+$/, "").trim();
  return (cleaned || text).slice(0, 350);
}

/**
 * « Clap back » : quand un membre VISE le bot (mention directe ou réponse à un
 * de ses messages), le bot répond AU TON — clash si on l'insulte/provoque,
 * réponse normale sinon (jamais un clash gratuit sur un message neutre). Par
 * défaut 100 % heuristique (gratuit) ; l'IA (CLAPBACK_AI=1) juge le ton et
 * répond au contexte quand elle est activée. Ne se déclenche JAMAIS sur un
 * message qui ne vise pas le bot. Renvoie true si une réplique a été envoyée.
 */
export async function handleBotClapback(message: Message, botId: string): Promise<boolean> {
  if (message.author.bot || !botId) return false;

  // 1) Le message vise-t-il le bot ? (mention directe OU réponse à un de ses messages)
  //    On récupère aussi le message référencé (même si c'est une réponse à un
  //    autre membre) pour donner le fil de la conversation à l'IA.
  const mentionsBot = message.mentions.users.has(botId);
  let ref: Message | null = null;
  if (message.reference?.messageId) {
    ref = await message.fetchReference().catch(() => null);
  }
  const repliesToBot = ref?.author?.id === botId;
  if (!mentionsBot && !repliesToBot) return false;

  const content = message.content ?? "";
  const isInsult = INSULT_PATTERNS.some((p) => p.test(content));
  const isProvoke = !isInsult && PROVOKE_PATTERNS.some((p) => p.test(content));
  const kind: ClapKind = isInsult ? "insult" : isProvoke ? "provoke" : "other";

  // 2) Cooldown par utilisateur (avant tout, y compris l'IA — anti-spam/quota).
  const now = Date.now();
  const last = lastClapAt.get(message.author.id) ?? 0;
  if (now - last < COOLDOWN_MS) {
    return false;
  }
  lastClapAt.set(message.author.id, now);

  // 3) Réponse au TON ADAPTÉ : insulte → clash ; provoc → déflection ;
  //    neutre → réponse NORMALE (jamais un clash gratuit). Si l'IA est activée
  //    (CLAPBACK_AI=1 + quota), elle lit le message et juge le ton elle-même ;
  //    sinon on sert une réplique statique DU BON TON.
  let reply: string | null = null;

  if (CLAPBACK_AI_ENABLED) {
    const chan = message.channel as { sendTyping?: () => Promise<void> };
    chan.sendTyping?.().catch(() => {});
    const mm = message.mentions.members;
    const othersMentioned = mm
      ? [...mm.values()].filter((m) => m.id !== botId && !m.user.bot).map((m) => m.displayName).slice(0, 6)
      : [];
    const repliedTo = ref
      ? {
          author: ref.member?.displayName ?? ref.author?.username ?? "quelqu'un",
          text: (ref.cleanContent ?? "").slice(0, 200),
          isBot: ref.author?.id === botId,
        }
      : null;
    // Question perso (dette/grade/WL/playtime) → on récupère ses vraies stats.
    // Stats réelles : TOUJOURS sur une question perso (il faut le chiffre) ;
    // sur une attaque, seulement ~40 % du temps — sinon il ressort les mêmes
    // chiffres à chaque clash (playtime en boucle) et ça devient lassant.
    let factSheet: string | null = null;
    const attackWithStats = (kind === "insult" || kind === "provoke") && Math.random() < 0.4;
    if (DATA_QUESTION.test(content) || attackWithStats) {
      factSheet = await fetchMemberContext(message.author.id);
    }
    // Le message vise-t-il un AUTRE membre ? → on récupère SES stats pour
    // pouvoir enchaîner sur lui avec de vrais chiffres.
    let targetName: string | null = null;
    let targetFacts: string | null = null;
    const firstTarget = mm ? [...mm.values()].find((m) => m.id !== botId && !m.user.bot) : undefined;
    if (firstTarget) {
      targetName = firstTarget.displayName;
      targetFacts = await fetchMemberContext(firstTarget.id);
    }

    reply = await askClapbackAI({
      cleanText: (message.cleanContent ?? content).slice(0, 400),
      authorName: message.member?.displayName ?? message.author.username,
      kind,
      othersMentioned,
      repliedTo,
      factSheet,
      provokeCount: kind === "other" ? 0 : bumpProvoke(message.author.id),
      targetName,
      targetFacts,
    });
  }

  if (!reply) {
    const pool = isInsult ? CLAPBACKS : isProvoke ? PROVOKE_REPLIES : NEUTRAL_REPLIES;
    reply = pool[Math.floor(Math.random() * pool.length)];
  }

  try {
    await message.reply(reply);
  } catch (e: any) {
    console.error("[CLAPBACK] échec de l'envoi:", e?.message ?? e);
  }
  return true;
}
