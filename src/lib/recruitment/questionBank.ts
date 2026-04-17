export type QuestionSection = "GENERAL" | "TRAP";

export type Question = {
  id: string;
  section: QuestionSection;
  label: string;
  pointsMax: number;
  hint?: string;
  step?: number;
  expectedAnswer?: string;
};

export const TOTAL_MAX_POINTS = 28.5;
export const MIN_ON20 = 14;

export const questionBank: Question[] = [
  // ── QUESTIONS GÉNÉRALES ──────────────────────────────────────────────────
  {
    id: "WARN_SCREEN",
    section: "GENERAL",
    label: "Avez-vous des warn ? (screen)",
    pointsMax: 1,
    expectedAnswer: "Oui ou Non. Une preuve peut être demandée si nécessaire.",
  },
  {
    id: "PAIN_RP",
    section: "GENERAL",
    label: "Qu'est-ce que le Pain RP ?",
    pointsMax: 1,
    expectedAnswer:
      "Simuler la douleur physique ou morale de façon réaliste.",
  },
  {
    id: "POWERGAMING",
    section: "GENERAL",
    label: "Qu'est-ce que le PowerGaming ?",
    pointsMax: 1,
    expectedAnswer:
      "Faire une action impossible ou irréaliste par rapport à la vie réelle.",
  },
  {
    id: "SAS_MAX",
    section: "GENERAL",
    label: "Combien de sas maximum sont autorisés ?",
    pointsMax: 1.5,
    expectedAnswer:
      "3 sas maximum (1 extérieur et 2 intérieurs).",
  },
  {
    id: "DOUBLE_BRAQUAGE_GEND",
    section: "GENERAL",
    label: "Combien de gendarmes sont requis pour un double braquage ?",
    pointsMax: 2,
    expectedAnswer: "10 gendarmes.",
  },
  {
    id: "DELAI_ACTION",
    section: "GENERAL",
    label: "Quel est le délai entre deux actions gendarmerie / GIGN ?",
    pointsMax: 1.5,
    expectedAnswer: "5 minutes.",
  },
  {
    id: "REBRAQUER_DELAY",
    section: "GENERAL",
    label: "Combien de temps avant de rebraquer une personne ou une maison ?",
    pointsMax: 2,
    expectedAnswer: "15 minutes.",
  },
  {
    id: "BRAQUER_SEUL_METIER",
    section: "GENERAL",
    label: "Peut-on braquer seul ?",
    pointsMax: 1,
    expectedAnswer:
      "Non, sauf métiers orange (cambrioleur / voleur).",
  },
  {
    id: "BRAQUER_CONSTRUCTION",
    section: "GENERAL",
    label: "Peut-on braquer une personne en construction ?",
    pointsMax: 1,
    expectedAnswer: "Non.",
  },
  {
    id: "TRAVERS_AUTORISES",
    section: "GENERAL",
    label: "Quels types de travers sont autorisés ?",
    pointsMax: 2,
    expectedAnswer: "Bois, vitres et grillages.",
  },
  {
    id: "ZONES_SAFE",
    section: "GENERAL",
    label: "Quelles sont les zones safe ?",
    pointsMax: 2,
    expectedAnswer:
      "Concession, armurerie, spawn métier (mairie), hôpital.",
  },
  {
    id: "MAGASINS_DERRIERE_GEND",
    section: "GENERAL",
    label: "Les magasins derrière la gendarmerie et le taco sont-ils braquables ?",
    pointsMax: 1,
    expectedAnswer: "Oui, uniquement en métier orange.",
  },
  {
    id: "BACKSTAB",
    section: "GENERAL",
    label: "Les backstabs sont-ils autorisés en fight (entre métier noir) ?",
    pointsMax: 1,
    expectedAnswer: "Oui, pas de limite.",
  },
  {
    id: "SOMMATION",
    section: "GENERAL",
    label: "Qu'est-ce qu'une sommation valide ?",
    pointsMax: 1.5,
    expectedAnswer:
      "3 sommations avec 10 secondes entre chacune.",
  },
  {
    id: "LIBERATION_OTAGES",
    section: "GENERAL",
    label: "La libération d'otages pendant un braquage est-elle autorisée ?",
    pointsMax: 1.5,
    expectedAnswer:
      "Non, cela entraîne un gunfight.",
  },

  // ── QUESTIONS PIÈGES ─────────────────────────────────────────────────────
  {
    id: "PIEGE_GENDARMES_RACKET",
    section: "TRAP",
    label: "Combien de gendarmes sont requis pour racketter une personne ?",
    pointsMax: 1.5,
    hint: "Question piège — la bonne réponse peut surprendre.",
    expectedAnswer: "0 — aucun gendarme requis pour racketter.",
  },
  {
    id: "PIEGE_OTAGE",
    section: "TRAP",
    label: "Votre collègue est braqué par 3 personnes, vous êtes seul, pouvez-vous tirer ?",
    pointsMax: 2,
    hint: "Question piège — penser à la règle No Fear Otage.",
    expectedAnswer:
      "Non (No Fear Otage) — il est interdit de tirer lorsqu'un membre de votre équipe est pris en otage.",
  },
  {
    id: "PIEGE_DICTATEUR",
    section: "TRAP",
    label: "Vous refusez de vivre sous la dictature. Avec vos collègues, vous tentez de renverser le dictateur, mais faute de moyens, vous échouez et y laissez la vie. Après cet échec, vous organisez aussitôt un attentat depuis le haut de la mairie pour en finir avec lui. Cette fois, l’attentat réussit : le dictateur est éliminé. Où est l’erreur ?",
    pointsMax: 2,
    hint: "Question piège — identifier la règle violée dans ce scénario.",
    expectedAnswer:
      "NLR — la règle New Life Rule est violée dans ce scénario : les joueurs morts ne peuvent pas reprendre le combat ou revenir sur place.",
  },
  {
    id: "PIEGE_EXPLOSION",
    section: "TRAP",
    label: "Un véhicule explose, vous tirez immédiatement après en être sortie: quelle est l'erreur ?",
    pointsMax: 2,
    hint: "Question piège — penser au Pain RP.",
    expectedAnswer:
      "Il faut attendre 10 secondes (No Pain RP) — un personnage touché par une explosion doit simuler la douleur avant de pouvoir agir.",
  },
];
