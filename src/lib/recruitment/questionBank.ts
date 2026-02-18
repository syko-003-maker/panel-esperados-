export type QuestionSection = "GENERAL" | "TRAP";

export type Question = {
  id: string;
  section: QuestionSection;
  label: string;
  pointsMax: number;
  hint?: string;
  step?: number;
};

export const TOTAL_MAX_POINTS = 28.5;
export const MIN_ON20 = 14;

export const questionBank: Question[] = [
  { id: "PRESENTE_TOI", section: "GENERAL", label: "Presente-toi", pointsMax: 0 },
  { id: "WARN_SCREEN", section: "GENERAL", label: "Warn screen", pointsMax: 1 },
  { id: "METAGAMING", section: "GENERAL", label: "Metagaming", pointsMax: 1 },
  { id: "NLR", section: "GENERAL", label: "NLR", pointsMax: 1 },
  { id: "PAIN_RP", section: "GENERAL", label: "Pain RP", pointsMax: 1 },
  { id: "POWERGAMING", section: "GENERAL", label: "Powergaming", pointsMax: 1 },
  { id: "SAS_MAX", section: "GENERAL", label: "SAS max", pointsMax: 1.5 },
  { id: "DOUBLE_BRAQUAGE_GEND", section: "GENERAL", label: "Double braquage gend", pointsMax: 2 },
  { id: "DELAI_ACTION", section: "GENERAL", label: "Delai action", pointsMax: 1.5 },
  { id: "REBRAQUER_DELAY", section: "GENERAL", label: "Rebraquer delay", pointsMax: 2 },
  { id: "BRAQUER_SEUL_METIER", section: "GENERAL", label: "Braquer seul metier", pointsMax: 1 },
  { id: "BRAQUER_CONSTRUCTION", section: "GENERAL", label: "Braquer construction", pointsMax: 1 },
  { id: "TRAVERS_AUTORISES", section: "GENERAL", label: "Travers autorises", pointsMax: 2 },
  { id: "ZONES_SAFE", section: "GENERAL", label: "Zones safe", pointsMax: 2 },
  { id: "MAGASINS_DERRIERE_GEND", section: "GENERAL", label: "Magasins derriere gend", pointsMax: 1 },
  { id: "BACKSTAB", section: "GENERAL", label: "Backstab", pointsMax: 1 },
  { id: "SOMMATION", section: "GENERAL", label: "Sommation", pointsMax: 1.5 },
  { id: "LIBERATION_OTAGES", section: "GENERAL", label: "Liberation otages", pointsMax: 1.5 },
  { id: "PIEGE_GENDARMES_RACKET", section: "TRAP", label: "Piege gendarmes racket", pointsMax: 1.5 },
  { id: "PIEGE_OTAGE", section: "TRAP", label: "Piege otage", pointsMax: 1 },
  { id: "PIEGE_DICTATEUR", section: "TRAP", label: "Piege dictateur", pointsMax: 2 },
  { id: "PIEGE_EXPLOSION", section: "TRAP", label: "Piege explosion", pointsMax: 1 },
];
