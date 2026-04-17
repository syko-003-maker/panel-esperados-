type StatusLike = string | null | undefined;

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  EXPIRED: "Expirée",
  CLOSED: "Clôturée",
  PENDING: "En attente",
  APPLIED: "Appliquée",
  FAILED: "Échouée",
  CANCELED: "Annulée",
  SENDING: "Envoi en cours",
  SENT: "Envoyée",
  RUNNING: "En cours",
  SUCCEEDED: "Succès",
  CLEAR_PENDING: "Levée en attente",
  CLEAR_APPLIED: "Levée appliquée",
  CLEAR_FAILED: "Levée échouée",
};

function normalize(value: StatusLike): string {
  return String(value ?? "").trim().toUpperCase();
}

export function getEffectiveSanctionStatus(
  status: StatusLike,
  clearedAt: Date | string | null,
  clearedStatus: StatusLike
): string {
  if (clearedAt) return "CLOSED";

  const normalizedClearedStatus = normalize(clearedStatus);
  if (normalizedClearedStatus === "PENDING") return "CLEAR_PENDING";
  if (normalizedClearedStatus === "APPLIED") return "CLEAR_APPLIED";
  if (normalizedClearedStatus === "FAILED") return "CLEAR_FAILED";

  const normalizedStatus = normalize(status);
  return normalizedStatus || "ACTIVE";
}

export function getSanctionStatusLabel(status: StatusLike): string {
  const normalized = normalize(status);
  if (!normalized) return "Inconnu";
  return STATUS_LABELS[normalized] ?? normalized.replace(/_/g, " ");
}
