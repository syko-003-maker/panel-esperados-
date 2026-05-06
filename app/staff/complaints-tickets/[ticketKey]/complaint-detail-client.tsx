"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Calendar, Tag, Hash, MessageSquare, Save, Copy, Check } from "lucide-react";
import { getDiscordThreadUrl } from "@/lib/discord-config";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";
import { SectionCard, StatusBadge, MotionButtonFrame } from "@/components/staff/ui";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatAppDate } from "@/lib/app-date-formatter";

type Complaint = {
  id: string;
  ticketKey: string;
  status: string;
  authorDiscordId: string | null;
  authorTag: string | null;
  targetName: string | null;
  title: string;
  description: string;
  summary: string | null;
  payload: Record<string, unknown> | null;
  threadId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedByDiscordId: string | null;
  closeReason: string | null;
};

const STATUS_OPTIONS = [
  { value: "OPEN", label: "OPEN" },
  { value: "RESOLVED", label: "TRAITÉ" },
  { value: "REJECTED", label: "NON RÉSOLU / REFUSÉ" },
  { value: "CLOSED", label: "FERMÉ" },
];

const STATUS_TONE: Record<string, "success" | "info" | "warning" | "neutral" | "danger"> = {
  OPEN: "success",
  RESOLVED: "info",
  REJECTED: "warning",
  CLOSED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Ouverte",
  RESOLVED: "Traitée",
  REJECTED: "Refusée",
  CLOSED: "Fermée",
};

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };
  return (
    <MotionButtonFrame>
      <Button onClick={onCopy} variant="outline" size="sm" className="gap-1.5">
        {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copié" : "Copier le lien"}
      </Button>
    </MotionButtonFrame>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:w-32 sm:shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-slate-200 break-words">{children}</dd>
    </div>
  );
}

export function ComplaintDetailClient({
  complaint: initialData,
}: {
  complaint: Complaint;
}) {
  const router = useRouter();
  const [complaint] = useState(initialData);
  const [newStatus, setNewStatus] = useState(complaint.status);
  const [newSummary, setNewSummary] = useState(complaint.summary ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const updateComplaint = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/staff/complaints-tickets/${complaint.ticketKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          summary: newSummary || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Erreur");
        return;
      }
      setSuccess(true);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const tone = STATUS_TONE[complaint.status] ?? "neutral";
  const label = STATUS_LABEL[complaint.status] ?? complaint.status;

  return (
    <div className="space-y-4">
      {/* Header — retour + ticket key + statut */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/staff/complaints"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-amber-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour aux plaintes
        </Link>
        <span className="text-slate-600">·</span>
        <span className="font-mono text-xs text-slate-300">{complaint.ticketKey}</span>
        <StatusBadge tone={tone}>{label}</StatusBadge>
      </div>

      {/* Bandeaux feedback */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div><span className="font-semibold">Erreur —</span> {error}</div>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-200">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div><span className="font-semibold">Plainte mise à jour.</span></div>
        </div>
      )}

      {/* 2 colonnes : infos + meta */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Informations" icon={Tag}>
          <dl className="space-y-3">
            <MetaRow label="Auteur Discord">
              {complaint.authorDiscordId ? (
                <Link
                  href={`/staff/members/by-discord/${complaint.authorDiscordId}`}
                  prefetch={false}
                  className="font-mono text-amber-300 hover:underline"
                >
                  {complaint.authorTag ?? complaint.authorDiscordId}
                </Link>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </MetaRow>
            <MetaRow label="Tag">{complaint.authorTag ?? <span className="text-slate-500">—</span>}</MetaRow>
            <MetaRow label="Cible">{complaint.targetName ?? <span className="text-slate-500">—</span>}</MetaRow>
          </dl>
        </SectionCard>

        <SectionCard title="Métadonnées" icon={Calendar}>
          <dl className="space-y-3">
            <MetaRow label="Créée le">{formatAppDate(complaint.createdAt)}</MetaRow>
            <MetaRow label="Mise à jour">{formatAppDate(complaint.updatedAt)}</MetaRow>
            <MetaRow label="Fermée le">
              {complaint.closedAt ? formatAppDate(complaint.closedAt) : <span className="text-slate-500">—</span>}
            </MetaRow>
            <MetaRow label="Fermée par">
              {complaint.closedByDiscordId ? (
                <span className="font-mono text-slate-300">{complaint.closedByDiscordId}</span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </MetaRow>
          </dl>
        </SectionCard>
      </div>

      {/* Raison / Titre */}
      <SectionCard title="Raison / Titre" icon={Hash}>
        <p className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-100">
          {complaint.title}
        </p>
      </SectionCard>

      {/* Description */}
      <SectionCard title="Description" icon={MessageSquare}>
        <p className="whitespace-pre-wrap rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-100">
          {complaint.description}
        </p>
      </SectionCard>

      {/* Payload brut (si présent) */}
      {complaint.payload && Object.keys(complaint.payload).length > 0 && (
        <SectionCard title="Payload" description="Données brutes reçues de Discord">
          <pre className="overflow-x-auto rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-[11px] leading-5 text-slate-300">
{JSON.stringify(complaint.payload, null, 2)}
          </pre>
        </SectionCard>
      )}

      {/* Thread Discord */}
      <SectionCard title="Thread Discord" description="Lien direct vers le thread du ticket">
        {complaint.threadId ? (
          <div className="flex flex-wrap items-center gap-2">
            <MotionButtonFrame>
              <a
                href={getDiscordThreadUrl(complaint.threadId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#7a1f2b]/40 bg-[#7a1f2b]/20 px-4 py-2 text-sm font-semibold text-rose-100 transition-colors hover:bg-[#7a1f2b]/30"
              >
                Ouvrir le thread Discord
              </a>
            </MotionButtonFrame>
            <CopyLinkButton url={getDiscordThreadUrl(complaint.threadId)} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">Aucun thread Discord associé.</p>
        )}
      </SectionCard>

      {/* Actions Staff */}
      <SectionCard
        title="Actions staff"
        description="Mise à jour du statut et notes internes. Le lock/archive du thread Discord se fait via les boutons Discord."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="cmpl-status" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Statut
            </label>
            <StyledSelect
              id="cmpl-status"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full max-w-xs"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </StyledSelect>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cmpl-summary" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Résumé / Notes internes
            </label>
            <textarea
              id="cmpl-summary"
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              rows={4}
              placeholder="Notes visibles uniquement par le staff…"
              className="w-full rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-2 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-amber-500/40 focus:outline-none"
            />
          </div>

          <MotionButtonFrame>
            <Button onClick={updateComplaint} disabled={loading} className="gap-2">
              <Save className="h-4 w-4" />
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </MotionButtonFrame>
        </div>
      </SectionCard>
    </div>
  );
}
