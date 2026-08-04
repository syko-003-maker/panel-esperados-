"use client";

import { getErrorMessage } from "@/lib/errors";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { canClearSanction, canDeleteSanction, getSanctionLabel } from "@/lib/sanctions";
import { getEffectiveSanctionStatus, getSanctionStatusLabel } from "@/lib/sanction-status-labels";
import { useConfirm } from "@/components/staff/ui/use-confirm";
import { StaffPage } from "../../ui/StaffPage";
import { Badge } from "../../ui/Badge";

type SanctionDetailProps = {
  sanction: {
    id: string;
    member: { rpName: string | null; discordId: string | null } | null;
    discordId: string;
    type: string;
    status: string;
    reason: string | null;
    discordStatus: string;
    outboxStatus: string | null;
    discordError: string | null;
    expiresAt: string | null;
    clearedAt: string | null;
    clearedStatus: string | null;
    clearedError: string | null;
    createdAt: string;
    source: string;
    /** Nom du staff qui a prononce la sanction ; null si posee par un automatisme. */
    createdByName: string | null;
  };
  audit: Array<{
    id: string;
    action: string;
    createdAt: string;
  }>;
};

type StatusTone = "green" | "red" | "yellow" | "blue" | "gray" | "orange" | "purple";

function getEffectiveStatusTone(status: string): StatusTone {
  if (status === "ACTIVE") return "yellow";
  if (status === "CLOSED" || status === "EXPIRED") return "gray";
  if (status === "CLEARED") return "green";
  return "gray";
}

function getDiscordStatusTone(status: string): StatusTone {
  if (status === "APPLIED") return "green";
  if (status === "FAILED") return "red";
  if (status === "PENDING") return "yellow";
  return "gray";
}

/** Une sanction automatique n'a pas d'auteur : on nomme son origine. */
/** Contexte de la sanction, en complément du nom — pas à sa place. */
const SOURCE_LABEL: Record<string, string> = {
  ACTIVITY: "via inactivité",
  MEETING: "via décision de réunion",
  SYSTEM: "automatique",
  DISCORD_COMMAND: "via commande Discord",
};

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
}

function InfoCard({
  label,
  children,
  hint,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "danger" | "warning";
}) {
  const accent =
    tone === "danger"
      ? "border-red-500/30 bg-red-500/[0.04]"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/[0.04]"
        : "border-white/10 bg-white/[0.03]";
  return (
    <div className={`rounded-2xl border ${accent} p-4`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-slate-100">{children}</div>
      {hint ? <div className="mt-2 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export default function SanctionDetailClient({ sanction: initialSanction, audit }: SanctionDetailProps) {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [sanction, setSanction] = useState(initialSanction);
  const [retrying, setRetrying] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [forcingApplied, setForcingApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrySuccess, setRetrySuccess] = useState(false);

  async function handleApply() {
    const ok = await confirm({
      title: "Appliquer la sanction maintenant ?",
      description: "La sanction sera mise en file d'attente pour être appliquée sur Discord (rôle, mute, etc.).",
      confirmLabel: "Appliquer",
      tone: "info",
    });
    if (!ok) return;

    setApplying(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/apply/${sanction.id}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Apply failed");
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  async function handleRetryDiscord() {
    setRetrying(true);
    setError(null);
    setRetrySuccess(false);

    try {
      const res = await fetch(`/api/staff/sanctions/apply/${sanction.id}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Échec");
      setSanction((prev) => ({ ...prev, discordStatus: "PENDING" }));
      setRetrySuccess(true);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setRetrying(false);
    }
  }

  async function handleForceApplied() {
    const ok = await confirm({
      title: "Forcer la sanction comme appliquée ?",
      description:
        "À utiliser uniquement si le membre est banni ou a définitivement quitté le serveur Discord — l'effet ne sera pas appliqué techniquement.",
      confirmLabel: "Forcer",
      tone: "warning",
    });
    if (!ok) return;

    setForcingApplied(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/${sanction.id}/force-applied`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec");
      setSanction((prev) => ({ ...prev, discordStatus: "APPLIED", discordError: null }));
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setForcingApplied(false);
    }
  }

  async function handleClear() {
    const isReserviste = sanction.type === "RESERVISTE";
    const ok = await confirm({
      title: isReserviste ? "Retirer l'état Réserviste ?" : "Lever la sanction ?",
      description: isReserviste
        ? "Le rôle Réserviste sera retiré sur Discord."
        : "L'effet de la sanction sera retiré sur Discord.",
      confirmLabel: "Confirmer",
      tone: "warning",
    });
    if (!ok) return;

    setClearing(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/${sanction.id}/clear`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec");
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setClearing(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Supprimer cette sanction ?",
      description: (
        <p>
          Cette action est <strong className="text-[#ff8a99]">irréversible</strong>.
        </p>
      ),
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!ok) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/${sanction.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        if (json?.error === "SANCTION_DELETE_BLOCKED_ALREADY_APPLIED") {
          throw new Error("Une sanction déjà appliquée ne peut pas être supprimée. Utilisez plutôt Lever ou Clôturer.");
        }
        if (json?.error === "SANCTION_DELETE_BLOCKED_OUTBOX_ALREADY_SENT_OR_RUNNING") {
          throw new Error("Impossible de supprimer : le traitement Discord est déjà en cours ou terminé. Utilisez plutôt Lever ou Clôturer.");
        }
        if (res.status === 409 && typeof json?.details?.message === "string") {
          throw new Error(json.details.message);
        }
        throw new Error(json?.error || "Delete failed");
      }

      router.push("/staff/sanctions");
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const effectiveStatus = getEffectiveSanctionStatus(
    sanction.status,
    sanction.clearedAt,
    sanction.clearedStatus
  );
  const canRetry = sanction.discordStatus === "FAILED";
  const canForce = sanction.discordStatus === "FAILED" || sanction.discordStatus === "PENDING";
  const canApply =
    sanction.discordStatus === "PENDING" && effectiveStatus === "ACTIVE" && !sanction.outboxStatus;
  const isApplied = sanction.discordStatus === "APPLIED";
  const clearActionLabel = sanction.type === "RESERVISTE" ? "Retirer réserviste" : "Lever la sanction";
  const canClear = canClearSanction(sanction);
  const canDelete = canDeleteSanction(sanction);
  const memberName = sanction.member?.rpName ?? "Membre inconnu";
  const memberDiscordId = sanction.member?.discordId ?? sanction.discordId;

  const hasAnyAction = canApply || isApplied || canRetry || canForce || canClear || canDelete;

  return (
    <>
      {confirmDialog}
      <StaffPage
        title="Détail de la sanction"
        subtitle={`ID ${sanction.id}`}
      >
        {error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        {/* Récap principal */}
        <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.6),hsl(var(--sunset-surface3)/0.6))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Membre sanctionné
              </div>
              <div className="mt-2 text-xl font-semibold text-slate-50">{memberName}</div>
              <div className="mt-1 font-mono text-xs text-slate-400">{memberDiscordId}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge tone={getEffectiveStatusTone(effectiveStatus)}>
                {getSanctionStatusLabel(effectiveStatus)}
              </Badge>
              <Badge tone={getDiscordStatusTone(sanction.discordStatus)}>
                Discord&nbsp;: {getSanctionStatusLabel(sanction.discordStatus)}
              </Badge>
            </div>
          </div>
        </section>

        {/* Infos détaillées */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <InfoCard label="Type">{getSanctionLabel(sanction.type)}</InfoCard>
          <InfoCard label="Créée le">{formatDateFr(sanction.createdAt)}</InfoCard>
          <InfoCard label="À l'origine">
            {sanction.createdByName ?? "Origine inconnue"}
            {sanction.source !== "MANUAL" && SOURCE_LABEL[sanction.source] ? (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({SOURCE_LABEL[sanction.source]})
              </span>
            ) : null}
          </InfoCard>
          {sanction.expiresAt ? (
            <InfoCard label="Expire le">{formatDateFr(sanction.expiresAt)}</InfoCard>
          ) : null}
          {sanction.clearedAt || sanction.clearedStatus || sanction.clearedError ? (
            <InfoCard
              label="Levée"
              tone={sanction.clearedError ? "danger" : undefined}
              hint={
                <>
                  {sanction.clearedStatus ? (
                    <div>Statut&nbsp;: {getSanctionStatusLabel(`CLEAR_${sanction.clearedStatus}`)}</div>
                  ) : null}
                  {sanction.clearedError ? (
                    <div className="text-red-300">Erreur&nbsp;: {sanction.clearedError}</div>
                  ) : null}
                </>
              }
            >
              {sanction.clearedAt ? formatDateFr(sanction.clearedAt) : "En cours"}
            </InfoCard>
          ) : null}
          <div className="md:col-span-2">
            <InfoCard label="Raison">
              {sanction.reason?.trim() || <span className="text-slate-500">— Aucune —</span>}
            </InfoCard>
          </div>
          {sanction.discordError ? (
            <div className="md:col-span-2">
              <InfoCard label="Erreur Discord" tone="danger">
                <span className="font-mono text-xs text-red-200">{sanction.discordError}</span>
              </InfoCard>
            </div>
          ) : null}
        </section>

        {/* Actions */}
        {hasAnyAction ? (
          <section className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Actions
            </div>

            {canApply ? (
              <div className="mt-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
                <div className="text-sm font-semibold text-blue-200">🎯 Application Discord</div>
                <p className="mt-1 text-xs text-blue-300/80">
                  Mettre en file d&apos;attente l&apos;application de la sanction (rôles, mute, etc.)
                </p>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {applying ? "⏳ Application…" : "⚡ Appliquer sur Discord"}
                </button>
              </div>
            ) : null}

            {isApplied ? (
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                <span>✅</span>
                <span>Sanction appliquée sur Discord</span>
              </div>
            ) : null}

            {canForce ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  {canRetry ? (
                    <button
                      onClick={handleRetryDiscord}
                      disabled={retrying || forcingApplied}
                      className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {retrying ? "En cours…" : "↺ Relancer Discord"}
                    </button>
                  ) : null}
                  <button
                    onClick={handleForceApplied}
                    disabled={forcingApplied || retrying}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-500/30 bg-slate-500/10 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title="À utiliser si le membre est banni ou a définitivement quitté le Discord"
                  >
                    {forcingApplied ? "En cours…" : "✓ Forcer appliqué"}
                  </button>
                </div>
                {retrySuccess ? (
                  <div className="text-xs text-amber-300">
                    Mis en file d&apos;attente — sera appliqué dès que le membre rejoint le serveur.
                  </div>
                ) : null}
              </div>
            ) : null}

            {(canClear || canDelete) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {canClear ? (
                  <button
                    onClick={handleClear}
                    disabled={clearing}
                    className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm font-medium text-green-200 transition-colors hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {clearing ? "En cours…" : clearActionLabel}
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deleting ? "Suppression…" : "🗑 Supprimer"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {isApplied && !canDelete ? (
              <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Une sanction déjà appliquée ne peut pas être supprimée. Utilisez plutôt « Lever la sanction ».
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Audit */}
        <section className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Audit
          </div>
          {audit.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
              Aucun audit pour le moment
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {audit.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
                >
                  <div className="font-mono text-xs font-semibold text-slate-200">
                    {log.action}
                  </div>
                  <div className="text-xs text-slate-500">{formatDateFr(log.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </StaffPage>
    </>
  );
}
