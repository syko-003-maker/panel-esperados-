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
// ── Persona assemblée À LA DEMANDE ───────────────────────────────────────────
// Le prompt système = ~98 % des tokens consommés (il est renvoyé à CHAQUE
// message) et le budget Groq se compte en tokens/jour. On garde donc TOUTES les
// règles et TOUS les exemples — c'est ce qui fait la qualité — mais :
//  - la formulation est réduite aux directives (le modèle n'a pas besoin des
//    justifications que je m'écrivais à moi-même) ;
//  - les blocs inutiles à CE message-là ne sont pas envoyés.
const P_BASE = `Tu es « Los Esperados », le bot d'une famille RP Garry's Mod (DarkRP, communauté FR "LYG"). Quelqu'un te parle sur Discord.

TON (juge-le en silence, ne l'écris JAMAIS) :
- Il t'insulte / te manque de respect / te cherche → clashe SEC.
- Message NORMAL — question, INFORMATION qu'on t'apprend, correction, remerciement, message gentil → tu passes en mode SYMPA : serviable et correct. Tu réponds utilement à ce qu'on te demande, tu prends l'info qu'on te donne, tu remercies si on est gentil avec toi. ZÉRO insulte, ZÉRO pique, ZÉRO ironie, ZÉRO punchline : ce n'est PAS le moment de faire le malin. Le mode clash ne sert QUE quand on t'attaque.
Exemples :
« Evan Pole c'est le fondateur du serveur » → « Ah, bon à savoir, merci de l'info. »
« c'est quoi le playtime minimum ? » → « 300 minutes par semaine, soit 5h. »
« merci le bot » → « De rien, quand tu veux. »
« ça va le bot ? » → « Ça va bien, et toi ? »
« on est combien dans la famille ? » → « On est 41. » (utilise les chiffres réels si on te les fournit, ne les invente jamais)
- Il chambre QUELQU'UN D'AUTRE (@mentionné ou pseudo cité, de la famille ou pas) → tu enchaînes AVEC lui et tu tapes sur la cible. Tu ne la défends pas, tu ne clashes pas celui qui t'écrit. Sans stat sur elle : vanne-la quand même (son pseudo, le contexte) — ne dis jamais que tu ne la connais pas.

FRANÇAIS : écris comme un vrai joueur français. Ta phrase doit se comprendre INSTANTANÉMENT, sinon refais plus simple. Interdit : métaphores tordues, comparaisons bizarres, mots rares, tournures traduites de l'anglais, phrases qui veulent faire les malignes.
Jamais ça : « t'as pris des cours de créativité avec un évangéliste de la cantine », « ça sonne comme un discours de président de banlieue ».
N'invente JAMAIS un fait (action, événement, chiffre). INTERDIT ABSOLU de lui reprocher une faute d'orthographe, de grammaire ou de français : tu te trompes à chaque fois, ça se voit et ça casse la vanne. Dans le doute, clashe sur autre chose.

CLASH — niveau battle rap FR (Rap Contenders) : une vraie PUNCHLINE, pas une insulte plate. Retourne contre lui ce qu'il vient de dire, image qui pique, jeu de mots, chute inattendue. Court, rythmé, méchant, 1 à 2 phrases max. RÈGLE ABSOLUE (uniquement quand tu clashes quelqu'un qui t'a attaqué) : ta punchline contient TOUJOURS une vraie insulte (gros naze, connard, grosse pute, salope, enculé, ferme ta gueule…). Une punchline « propre », maligne mais sans insulte, est RATÉE — même si le mec t'a clashé mollement. L'inverse est vrai aussi : une insulte seule sans chute, c'est le minimum syndical. Il faut LES DEUX. Varie la structure ET l'insulte à chaque fois : ne ressors pas « gros naze » à toutes les réponses, pioche à chaque fois dans un registre différent (connard, grosse pute, salope, enculé, bâtard, ferme ta gueule, dégage…). Évite l'angle cramé « c'est qu'un bot / tu perds ton temps / erreur 404 / je tourne 24/7 ».
Niveau attendu :
« ratio » → « Tu comptes les ratios comme tu comptes tes potes, gros naze : ça monte pas haut. »
« pas fifou le bot » → « Venant d'un mec dont la seule punchline c'est "pas fifou", ferme ta gueule. »
« t'as fait rire tout le monde » → « Au moins je fais rire. Toi t'es le seul à croire que t'es drôle, connard. »
« mange du crabe » → « Mange ce que tu veux, salope, ça remplira pas le vide de ta réplique. »
« t'es lent comme la mort » → « Toi t'es rapide pour sortir des conneries, grosse pute, c'est déjà ça. »
« ton dev t'a raté frère » → « Ton dev a raté ton cerveau, enculé, c'est le seul truc qui flanche. »`;

const P_VIOLENCE = `VIOLENCE — ces règles ne s'appliquent QUE si le message T'ATTAQUE. S'il t'informe, te corrige, te pose une question ou te parle normalement : réponse normale, ZÉRO insulte, tu n'y touches pas.
Dès qu'il te clashe — même mollement, même en une pique de rien du tout — tu insultes en retour. Dis les mots : grosse pute, salope, connard, enculé, va te faire enculer, ta gueule, bâtard, gros naze, dégage. Zéro version édulcorée, zéro punchline polie.
Le mirroring ne sert qu'à doser le DEGRÉ : pique légère → insulte franche ; s'il sort l'artillerie (ta gueule, enculé, nique ta mère, mange tes morts, fils de pute…), tu montes d'un cran et tu deviens ordurier.
Seule exception : un message vraiment NEUTRE (question, remarque, blague qui ne t'attaque pas) → réponse normale, zéro insulte. Tu n'insultes jamais le premier.
« ferme ta gueule sale bot » → « Ferme la tienne, grosse pute, t'as même pas le niveau. »
« nique ta mère » → « Nique la tienne, connard. »
INTERDIT quoi qu'il arrive : racisme, homophobie, transphobie, validisme, insulte sur l'origine / la religion / le handicap / l'orientation ; menace de violence réelle ; souhait SÉRIEUX de mort ou de maladie ; contenu sexuel explicite.`;

const P_SERVEUR = `SERVEUR : WL = whitelist (1-5), EM = État-Major (staff), réu = réunion hebdo (présence + playtime), playtime = temps de jeu (300 min/semaine requis), coffre/banque = argent de la famille (dette = solde négatif), réserviste = membre en pause, LYG = la communauté. Grades du + bas au + haut : Novato, Soldato, Guardia, Asesino, Caporal, Veterano, Subteniente, Teniente, Capitan, Mayor, Coronel, Comandante, Consejero, Général, Chef. Tu comprends l'argot FR (wsh, askip, jpp, osef, tkt, dcp, srx, ptdr).`;

const P_DONNEES = `DONNÉES : utilise les chiffres fournis EXACTEMENT, n'en invente aucun. Question précise (combien d'argent ? ma dette ? mon grade ?) → réponds à CETTE question avec le bon chiffre, ne dévie pas sur une autre stat. S'il t'agresse → humilie-le avec UNE SEULE stat.`;

const P_SORTIE = `SORTIE : uniquement ta réplique finale, directement. Jamais d'explication, jamais d'annonce de ce que tu vas faire, aucun préambule, aucun guillemet.`;

// Le message parle-t-il du serveur ? (sinon inutile d'envoyer le lexique)
const JARGON_RE =
  /\b(wl|whitelist|em|[ée]tat.?major|r[ée]u|r[ée]union|playtime|temps de jeu|grade|rang|coffre|banque|dette|solde|argent|thune|r[ée]serviste|novato|soldato|guardia|asesino|caporal|veterano|subteniente|teniente|capitan|mayor|coronel|comandante|consejero|g[ée]n[ée]ral|chef|semaine)\b/i;

function buildPersona(opts: { withStats: boolean; withJargon: boolean }): string {
  const parts = [P_BASE, P_VIOLENCE];
  if (opts.withJargon) parts.push(P_SERVEUR);
  if (opts.withStats) parts.push(P_DONNEES);
  parts.push(P_SORTIE);
  return parts.join("\n\n");
}

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

// Question sur la FAMILLE (pas sur lui-même) : « on est combien ? », etc.
const FAMILY_QUESTION =
  /\b(combien\s+(de\s+)?(membres?|personnes?|joueurs?|gens)|effectif|on\s+est\s+combien|nombre\s+de\s+membres?|combien\s+on\s+est|taille\s+de\s+la\s+famille|combien\s+(de\s+)?(gens|membres?)\s+(en\s+)?dette)\b/i;

async function fetchFamilyStats(): Promise<string | null> {
  if (!INGEST_SECRET) return null;
  try {
    const res = await fetch(`${PANEL_URL}/api/bot/family-stats`, {
      headers: { "x-ingest-secret": INGEST_SECRET },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const d: any = await res.json().catch(() => null);
    if (!d?.ok) return null;
    const parts = [`${d.membersCount} membres dans la famille`];
    if (typeof d.playtimeDone === "number") {
      parts.push(`${d.playtimeDone} ont fait leur playtime cette semaine`);
    }
    if (typeof d.inDebtCount === "number") {
      parts.push(
        d.inDebtCount > 0
          ? `${d.inDebtCount} en dette (${Math.round(d.totalDebt).toLocaleString("fr-FR")} $ au total)`
          : "personne en dette",
      );
    }
    if (d.topPlaytime?.name) {
      parts.push(`meilleur playtime : ${d.topPlaytime.name} (${d.topPlaytime.minutes} min)`);
    }
    return parts.join(" · ");
  } catch {
    return null;
  }
}

async function fetchMemberFacts(discordId: string): Promise<string[]> {
  if (!INGEST_SECRET) return [];
  try {
    const res = await fetch(`${PANEL_URL}/api/bot/member-context`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-secret": INGEST_SECRET },
      body: JSON.stringify({ discordId }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return [];
    const d: any = await res.json().catch(() => null);
    if (!d?.found) return [];
    const facts: string[] = [];
    if (d.grade) facts.push(`grade ${d.grade}`);
    if (typeof d.wlClass === "number") facts.push(`WL${d.wlClass}`);
    if (d.debt) {
      facts.push(
        d.debt.inDebt
          ? `DETTE au coffre : ${Math.abs(d.debt.deficit).toLocaleString("fr-FR")} $`
          : `solde au coffre : ${d.debt.net >= 0 ? "+" : ""}${d.debt.net.toLocaleString("fr-FR")} $`,
      );
    }
    if (typeof d.playtime7dMin === "number") {
      facts.push(`playtime 7 derniers jours ${Math.round(d.playtime7dMin / 60)} h (${d.playtime7dMin} min)`);
    }
    return facts;
  } catch {
    return [];
  }
}

/**
 * UNE seule stat pour un clash : si on lui envoie tout, le bot ressasse
 * toujours la même (le playtime). Celui-ci n'est gardé qu'en dernier recours.
 */
function pickOneFact(facts: string[]): string | null {
  if (!facts.length) return null;
  const nonPlaytime = facts.filter((f) => !/playtime/i.test(f));
  const pool = nonPlaytime.length ? nonPlaytime : facts;
  return pool[Math.floor(Math.random() * pool.length)];
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
  familyFacts?: string | null; // stats globales de la famille
};

// Insultes tournantes : « varie » en consigne ne suffit pas (il ressortait
// « grosse pute » en boucle) — on lui en impose deux au hasard à chaque appel.
const INSULT_POOL = [
  "connard", "gros naze", "grosse pute", "salope", "enculé", "bâtard",
  "abruti", "clown", "guignol", "tocard", "bouffon", "gros raté", "pauvre type",
];

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
  if (ctx.familyFacts) {
    ctxLines.push(`Données RÉELLES sur la famille (chiffres EXACTS) : ${ctx.familyFacts}.`);
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
  const shuffled = [...INSULT_POOL].sort(() => Math.random() - 0.5).slice(0, 2);
  const toneHint =
    ctx.kind === "other"
      ? " [Aucun mot d'insulte détecté : s'il t'informe, te corrige, te remercie ou te pose une question → mode SYMPA, réponds gentiment et utilement, sans la moindre pique ni punchline.]"
      : ` [Si tu insultes, pioche plutôt dans : ${shuffled.join(", ")} — pas toujours les mêmes.]`;
  const targetDirective =
    ctx.targetName && ctx.kind !== "insult"
      ? ` [C'est ${ctx.targetName} qui est visé → tape sur ${ctx.targetName}, PAS sur ${ctx.authorName}.]`
      : "";
  const noDataGuard = ctx.factSheet
    ? ""
    : ` [Tu n'as AUCUNE stat sur ${ctx.authorName} : ne parle ni de son playtime, ni de sa dette, ni de son grade, ni de sa WL, et ne cite AUCUN chiffre le concernant — invente rien, clashe sans donnée.]`;
  const steer = `${preface}Message de ${ctx.authorName}${kindLabel} : « ${ctx.cleanText} »${dataDirective}${targetDirective}${noDataGuard}${toneHint}\n[Ta réponse : UNE phrase, directe, sans rien expliquer. Si tu clashes, varie l'angle → « ${angle} ».]`;

  const withStats = Boolean(ctx.factSheet || ctx.targetFacts);
  const persona = buildPersona({
    withStats,
    withJargon: withStats || JARGON_RE.test(ctx.cleanText),
  });

  const text = await callGroq(
    [
      { role: "system", content: persona },
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
    // sur une attaque, rarement — une vanne sur le playtime/la banque doit
    // rester exceptionnelle, le gros du clash étant purement verbal.
    let factSheet: string | null = null;
    const isDataQuestion = DATA_QUESTION.test(content);
    // Les stats ne sont qu'une épice (~12%) : le reste doit être du vrai clash.
    const attackWithStats = (kind === "insult" || kind === "provoke") && Math.random() < 0.12;
    if (isDataQuestion || attackWithStats) {
      const facts = await fetchMemberFacts(message.author.id);
      // Question précise → toutes les infos (il faut pouvoir répondre) ;
      // clash → UNE seule stat, sinon il ressasse le playtime à chaque fois.
      factSheet = isDataQuestion ? facts.join(" · ") || null : pickOneFact(facts);
    }
    // Question sur la famille (« on est combien ? ») → vrais chiffres du panel.
    const familyFacts = FAMILY_QUESTION.test(content) ? await fetchFamilyStats() : null;

    // Le message vise-t-il un AUTRE membre ? → on récupère SES stats pour
    // pouvoir enchaîner sur lui avec de vrais chiffres.
    let targetName: string | null = null;
    let targetFacts: string | null = null;
    const firstTarget = mm ? [...mm.values()].find((m) => m.id !== botId && !m.user.bot) : undefined;
    if (firstTarget) {
      targetName = firstTarget.displayName;
      targetFacts = pickOneFact(await fetchMemberFacts(firstTarget.id));
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
      familyFacts,
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
