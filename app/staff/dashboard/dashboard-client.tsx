"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { PageShell } from "@/components/staff/ui/PageShell";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import {
  AlertCircle,
  Users,
  FileText,
  Ban,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Landmark,
  ClipboardList,
  CalendarClock,
  UserCheck,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { getSanctionLabel } from "@/lib/sanctions";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { formatAppDate } from "@/lib/app-date-formatter";
import { useDashboardData } from "@/lib/hooks/useDashboardData";

type Complaint = {
  id: string;
  ticketKey: string | null;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED" | "CLOSED";
  createdAt: string;
};
type Recruitment = {
  id: string;
  ticketKey: string;
  status: "OPEN" | "FINI";
  rpName: string | null;
  authorTag: string | null;
  createdAt: string;
};
type Sanction = {
  id: string;
  memberId: string;
  memberName?: string | null;
  type: string;
  status: string;
  reason: string | null;
  createdAt: string;
};

function fmtDate(iso: string | null) { return formatAppDate(iso); }

function formatMoney(amount: number | null): string {
  if (amount == null) return "N/A";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    .format(amount).replace("$US", "$").replace("USD", "$");
}

const COMPLAINT_STATUS: Record<string, { label: string; tone: "danger" | "warning" | "success" | "neutral" }> = {
  OPEN:      { label: "Ouverte",   tone: "danger" },
  IN_REVIEW: { label: "En cours",  tone: "warning" },
  RESOLVED:  { label: "Résolue",   tone: "success" },
  REJECTED:  { label: "Refusée",   tone: "neutral" },
  CLOSED:    { label: "Fermée",    tone: "neutral" },
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

type KpiTone = "warning" | "danger" | "success" | "info" | "bank";

const KPI_STYLES: Record<KpiTone, { icon: string; bg: string; border: string; value: string }> = {
  warning: {
    icon:   "text-amber-300",
    bg:     "bg-amber-500/10",
    border: "border-amber-500/25",
    value:  "text-amber-100",
  },
  danger: {
    icon:   "text-red-300",
    bg:     "bg-red-500/10",
    border: "border-red-500/25",
    value:  "text-red-100",
  },
  success: {
    icon:   "text-emerald-300",
    bg:     "bg-emerald-500/10",
    border: "border-emerald-500/25",
    value:  "text-emerald-100",
  },
  info: {
    icon:   "text-sky-300",
    bg:     "bg-sky-500/10",
    border: "border-sky-500/25",
    value:  "text-sky-100",
  },
  bank: {
    icon:   "text-violet-300",
    bg:     "bg-violet-500/10",
    border: "border-violet-500/25",
    value:  "text-violet-100",
  },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
  href,
  isAmount,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: number | null;
  tone: KpiTone;
  href: string;
  isAmount?: boolean;
  loading?: boolean;
}) {
  const s = KPI_STYLES[tone];
  return (
    <Link href={href} className="group block">
      <div className={`relative overflow-hidden rounded-2xl border ${s.border} bg-white/[0.02] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.04] hover:shadow-lg`}>
        {/* Subtle gradient top bar */}
        <div className={`absolute inset-x-0 top-0 h-[2px] ${s.bg} opacity-80`} />

        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.bg}`}>
            <Icon className={`h-4.5 w-4.5 ${s.icon}`} style={{ width: "1.125rem", height: "1.125rem" }} />
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-slate-700 transition-all group-hover:text-slate-400 group-hover:translate-x-0.5 mt-0.5" />
        </div>

        <div className="mt-3">
          {loading ? (
            <Skeleton className="h-7 w-16 mb-1" />
          ) : (
            <div className={`font-bold tracking-tight ${isAmount ? "text-xl leading-tight" : "text-3xl"} ${s.value}`}>
              {isAmount ? formatMoney(value) : (value ?? "—")}
            </div>
          )}
          <p className="mt-1 text-xs text-slate-500 leading-snug">{label}</p>
        </div>
      </div>
    </Link>
  );
}

// ─── Section shell ─────────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  href,
  linkLabel,
  children,
  count,
}: {
  title: string;
  icon: React.ElementType;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/8 bg-white/[0.015] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-200">{title}</span>
          {count != null && count > 0 && (
            <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-400">
              {count}
            </span>
          )}
        </div>
        <Link
          href={href}
          className="flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-amber-300"
        >
          {linkLabel}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

// ─── Shared row ────────────────────────────────────────────────────────────────

function ListRow({ children, href }: { children: React.ReactNode; href?: string }) {
  const cls = "flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-b-0 transition-colors hover:bg-white/[0.03]";
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <div className={cls}>{children}</div>;
}

function SectionEmpty({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-12 text-sm text-slate-600">{label}</div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

// ─── Alert strip for urgent actions ───────────────────────────────────────────

function AlertStrip({
  href,
  color,
  label,
  sub,
}: {
  href: string;
  color: "red" | "amber" | "sky";
  label: string;
  sub: string;
}) {
  const cls = {
    red:   "border-red-500/20   bg-red-500/[0.07]   text-red-200   hover:bg-red-500/[0.12]",
    amber: "border-amber-500/20 bg-amber-500/[0.07] text-amber-200 hover:bg-amber-500/[0.12]",
    sky:   "border-sky-500/20   bg-sky-500/[0.07]   text-sky-200   hover:bg-sky-500/[0.12]",
  }[color];
  return (
    <Link href={href} className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${cls}`}>
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs opacity-70 mt-0.5">{sub}</p>
      </div>
      <ArrowRight className="h-4 w-4 opacity-50 shrink-0" />
    </Link>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function StaffDashboardClient() {
  const { data, loading, error, refresh } = useDashboardData();

  const { complaints, recruitments, sanctions, pendingAbsences, membersCount, membersSource, membersError, familyBankBalance, debtors } = data;

  const complaintsArr  = Array.isArray(complaints)      ? complaints      : [];
  const recruitmentsArr = Array.isArray(recruitments)   ? recruitments    : [];
  const sanctionsArr   = Array.isArray(sanctions)       ? sanctions       : [];
  const pendingArr     = Array.isArray(pendingAbsences) ? pendingAbsences : [];
  const debtorsArr     = Array.isArray(debtors)         ? debtors         : [];

  const openComplaints   = complaintsArr.filter(c => c.status === "OPEN").length;
  const openRecruitments = recruitmentsArr.filter(r => r.status === "OPEN").length;
  const urgentCount      = openComplaints + openRecruitments + sanctionsArr.length + pendingArr.length;

  return (
    <PageShell
      title="Dashboard"
      description="Vue d'ensemble des flux prioritaires."
      icon={TrendingUp}
      actions={
        <MotionButtonFrame>
          <Button
            onClick={() => refresh(true)}
            disabled={loading}
            variant="outline"
            size="sm"
            className="gap-2 rounded-2xl border-white/10 bg-white/[0.04]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Rafraîchir
          </Button>
        </MotionButtonFrame>
      }
    >
      {/* ── Alertes ── */}
      {membersSource === "db_stale" && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold">Données membres en fallback —</span>{" "}
            source LYG indisponible, affichage depuis la base locale.
            {membersError && <span className="ml-1 font-mono text-xs opacity-70">{membersError}</span>}
          </div>
        </div>
      )}
      {error && !membersSource && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div><span className="font-semibold">Erreur de chargement —</span> {error}</div>
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard icon={AlertCircle}  label="Plaintes ouvertes"      value={complaintsArr.length}  tone="danger"  href="/staff/complaints"  loading={loading} />
        <KpiCard icon={UserCheck}    label="Recrutements en attente" value={recruitmentsArr.length} tone="info"    href="/staff/recruitments" loading={loading} />
        <KpiCard icon={Ban}          label="Sanctions actives"       value={sanctionsArr.length}   tone="warning" href="/staff/sanctions"    loading={loading} />
        <KpiCard icon={Users}        label="Membres actifs"          value={membersCount}           tone="success" href="/staff/members"      loading={loading} />
        <KpiCard icon={Landmark}     label="Banque famille"          value={familyBankBalance}      tone="bank"    href="/staff/stats"        loading={loading} isAmount />
      </div>

      {/* ── Content grid ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Actions urgentes */}
        <Section title="Actions urgentes" icon={AlertCircle} href="#" linkLabel="" count={urgentCount}>
          <div className="flex flex-col gap-2 p-3">
            {loading ? <SectionSkeleton /> : (
              <>
                {openComplaints > 0 && (
                  <AlertStrip href="/staff/complaints" color="red"
                    label={`${openComplaints} plainte${openComplaints > 1 ? "s" : ""} ouverte${openComplaints > 1 ? "s" : ""}`}
                    sub="Nécessite une prise en charge" />
                )}
                {openRecruitments > 0 && (
                  <AlertStrip href="/staff/recruitments" color="amber"
                    label={`${openRecruitments} recrutement${openRecruitments > 1 ? "s" : ""} à décider`}
                    sub="Candidatures en attente de validation" />
                )}
                {sanctionsArr.length > 0 && (
                  <AlertStrip href="/staff/sanctions" color="amber"
                    label={`${sanctionsArr.length} sanction${sanctionsArr.length > 1 ? "s" : ""} active${sanctionsArr.length > 1 ? "s" : ""}`}
                    sub="Sanctions en cours à surveiller" />
                )}
                {pendingArr.length > 0 && (
                  <AlertStrip href="/staff/absences" color="sky"
                    label={`${pendingArr.length} absence${pendingArr.length > 1 ? "s" : ""} en attente`}
                    sub="À approuver ou refuser" />
                )}
                {urgentCount === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500/40" />
                    <p className="text-sm text-slate-500">Tout est à jour</p>
                  </div>
                )}
              </>
            )}
          </div>
        </Section>

        {/* Recrutements */}
        <Section title="Recrutements" icon={UserCheck} href="/staff/recruitments" linkLabel="Voir tout" count={recruitmentsArr.length}>
          {loading ? <SectionSkeleton /> : recruitmentsArr.length === 0 ? (
            <SectionEmpty label="Aucun recrutement en attente" />
          ) : (
            recruitmentsArr.map(rec => (
              <ListRow key={rec.id} href={`/staff/recruitments/${rec.ticketKey}`}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-[11px] font-bold text-sky-300 uppercase">
                  {(rec.rpName ?? rec.ticketKey).charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200">{rec.rpName ?? rec.ticketKey}</p>
                  <p className="text-[11px] text-slate-600">{fmtDate(rec.createdAt)}</p>
                </div>
                <StatusBadge tone={rec.status === "OPEN" ? "warning" : "neutral"} className="shrink-0 text-[11px]">
                  {rec.status === "OPEN" ? "En attente" : "Clôturé"}
                </StatusBadge>
              </ListRow>
            ))
          )}
        </Section>

        {/* Sanctions */}
        <Section title="Sanctions actives" icon={Ban} href="/staff/sanctions" linkLabel="Voir tout" count={sanctionsArr.length}>
          {loading ? <SectionSkeleton /> : sanctionsArr.length === 0 ? (
            <SectionEmpty label="Aucune sanction active" />
          ) : (
            sanctionsArr.map(sanc => (
              <ListRow key={sanc.id} href={`/staff/sanctions/${sanc.id}`}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-[11px] font-bold text-red-300 uppercase">
                  {(sanc.memberName ?? "?").charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-slate-200 truncate">{sanc.memberName ?? "Membre"}</span>
                    <span className="text-[11px] text-slate-600">{getSanctionLabel(sanc.type)}</span>
                  </div>
                  {sanc.reason && <p className="text-[11px] text-slate-600 truncate">{sanc.reason}</p>}
                </div>
                <StatusBadge tone="danger" className="shrink-0 text-[11px]">Active</StatusBadge>
              </ListRow>
            ))
          )}
        </Section>

        {/* Plaintes */}
        <Section title="Plaintes" icon={FileText} href="/staff/complaints" linkLabel="Voir tout" count={complaintsArr.length}>
          {loading ? <SectionSkeleton /> : complaintsArr.length === 0 ? (
            <SectionEmpty label="Aucune plainte ouverte" />
          ) : (
            complaintsArr.map(comp => {
              const st = COMPLAINT_STATUS[comp.status] ?? COMPLAINT_STATUS.OPEN;
              return (
                <ListRow key={comp.id} href={`/staff/complaints/${comp.id}`}>
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                    comp.status === "OPEN" ? "bg-red-500/10 text-red-300" : "bg-white/5 text-slate-500"}`}>
                    {comp.ticketKey?.slice(0, 2) ?? "#"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {comp.ticketKey?.trim() ? `Plainte ${comp.ticketKey.trim()}` : `Plainte #${comp.id.slice(-4)}`}
                    </p>
                    <p className="text-[11px] text-slate-600">{fmtDate(comp.createdAt)}</p>
                  </div>
                  <StatusBadge tone={st.tone} className="shrink-0 text-[11px]">{st.label}</StatusBadge>
                </ListRow>
              );
            })
          )}
        </Section>

        {/* Membres en dette */}
        <Section title="Membres en dette" icon={CreditCard} href="/staff/stats" linkLabel="Voir tout" count={debtorsArr.length}>
          {loading ? <SectionSkeleton /> : debtorsArr.length === 0 ? (
            <SectionEmpty label="Aucun membre en déficit" />
          ) : (
            debtorsArr.map((d, i) => (
              <ListRow key={d.steamId} href={`/staff/banklogs?steamId=${d.steamId}`}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[11px] font-bold text-slate-500 tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">{d.rpName ?? "Non lié"}</span>
                <span className="shrink-0 font-bold tabular-nums text-sm text-red-400">{formatMoney(d.debt)}</span>
              </ListRow>
            ))
          )}
        </Section>

        {/* Absences en attente */}
        <Section title="Absences en attente" icon={CalendarClock} href="/staff/absences" linkLabel="Voir tout" count={pendingArr.length}>
          {loading ? <SectionSkeleton /> : pendingArr.length === 0 ? (
            <SectionEmpty label="Aucune absence à valider" />
          ) : (
            (pendingArr as any[]).map((abs: any) => (
              <ListRow key={abs.id}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-[11px] font-bold text-sky-300 uppercase">
                  {(abs.member?.rpName ?? abs.discordId ?? "?").charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200">{abs.member?.rpName ?? abs.discordId ?? "—"}</p>
                  <p className="text-[11px] text-slate-600">{fmtDate(abs.createdAt)}</p>
                </div>
                <StatusBadge tone="warning" className="shrink-0 text-[11px]">En attente</StatusBadge>
              </ListRow>
            ))
          )}
        </Section>

      </div>
    </PageShell>
  );
}
