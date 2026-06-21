"use client";

import ReglementQuickChat from "@/components/reglement/reglement-quick-chat";
import StaffOnlineStrip from "@/components/lyg/staff-online-strip";
import React from "react";
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
import { MotionButtonFrame, STAFF_EASE_OUT } from "@/components/staff/ui/motion";
import { motion, type Variants } from "motion/react";

// ─── Variants d'entrée dashboard ──────────────────────────────────────────
const dashSectionFade: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (delay: number = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.36, ease: STAFF_EASE_OUT, delay },
  }),
};
const dashKpiParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const dashKpiChild: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: STAFF_EASE_OUT } },
};
import { formatAppDate } from "@/lib/app-date-formatter";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { useDiscordAvatars } from "@/lib/hooks/useDiscordAvatars";

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

// fmtDate retiré : formatAppDate est utilisé directement (helper centralisé).

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
      <div className={`premium-card premium-card-bordeaux relative overflow-hidden rounded-2xl border ${s.border} bg-white/[0.02] p-4`}>
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
            <div className={`truncate font-bold tracking-tight ${isAmount ? "text-base leading-tight sm:text-xl" : "text-2xl sm:text-3xl"} ${s.value}`}>
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
    <div className="premium-card premium-surface flex flex-col rounded-2xl border border-white/8 bg-white/[0.015] overflow-hidden">
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

function DebtorAvatar({ url, name }: { url?: string | null; name?: string | null }) {
  const [failed, setFailed] = React.useState(false);
  const initials = (name ?? "?").trim().charAt(0).toUpperCase();
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name ?? ""}
        onError={() => setFailed(true)}
        className="h-7 w-7 shrink-0 rounded-lg object-cover border border-white/10"
      />
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[11px] font-bold text-slate-400">
      {initials}
    </span>
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

// Statuts DB considérés comme "en attente" (OPEN ou PENDING selon la version du schema)
function isRecruitmentPending(status: string): boolean {
  return status === "OPEN" || status === "PENDING" || status === "NEW" || status === "CREATED";
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function StaffDashboardClient() {
  const { data, loading, error, refresh } = useDashboardData();

  // Solde personnel du staff connecté (via /api/member/dashboard).
  // undefined = en cours, null = compte non lié à une fiche membre.
  const [personalBalance, setPersonalBalance] = React.useState<number | null | undefined>(undefined);
  React.useEffect(() => {
    let active = true;
    fetch("/api/member/dashboard", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (!active) return;
        if (j?.ok && j.debt && typeof j.debt.net === "number") setPersonalBalance(j.debt.net);
        else setPersonalBalance(null);
      })
      .catch(() => { if (active) setPersonalBalance(null); });
    return () => { active = false; };
  }, []);

  const { complaints, recruitments, sanctions, pendingAbsences, membersCount, membersSource, membersError, familyBankBalance, debtors } = data;

  const complaintsArr  = Array.isArray(complaints)      ? complaints      : [];
  const recruitmentsArr = Array.isArray(recruitments)   ? recruitments    : [];
  const sanctionsArr   = Array.isArray(sanctions)       ? sanctions       : [];
  const pendingArr     = Array.isArray(pendingAbsences) ? pendingAbsences : [];
  const debtorsArr     = Array.isArray(debtors)         ? debtors         : [];
  const debtorAvatars  = useDiscordAvatars(debtorsArr.map((d: any) => d.discordId));

  const openComplaints   = complaintsArr.filter(c => c.status === "OPEN").length;
  const openRecruitments = recruitmentsArr.filter(r => isRecruitmentPending(r.status)).length;
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
        <motion.div
          className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-200"
          variants={dashSectionFade} initial="hidden" animate="visible" custom={0}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold">Données membres en fallback —</span>{" "}
            source LYG indisponible, affichage depuis la base locale.
            {membersError && <span className="ml-1 font-mono text-xs opacity-70">{membersError}</span>}
          </div>
        </motion.div>
      )}
      {error && !membersSource && (
        <motion.div
          className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-200"
          variants={dashSectionFade} initial="hidden" animate="visible" custom={0}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div><span className="font-semibold">Erreur de chargement —</span> {error}</div>
        </motion.div>
      )}

      {/* ── KPI Grid ── */}
      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
        variants={dashKpiParent}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={dashKpiChild}>
          <KpiCard icon={AlertCircle}  label="Plaintes ouvertes"       value={complaintsArr.length}  tone="danger"  href="/staff/complaints"   loading={loading} />
        </motion.div>
        <motion.div variants={dashKpiChild}>
          <KpiCard icon={UserCheck}    label="Recrutements en attente" value={recruitmentsArr.length} tone="info"    href="/staff/recruitments" loading={loading} />
        </motion.div>
        <motion.div variants={dashKpiChild}>
          <KpiCard icon={Ban}          label="Sanctions actives"       value={sanctionsArr.length}   tone="warning" href="/staff/sanctions"    loading={loading} />
        </motion.div>
        <motion.div variants={dashKpiChild}>
          <KpiCard icon={Users}        label="Membres actifs"          value={membersCount}           tone="success" href="/staff/members"      loading={loading} />
        </motion.div>
        <motion.div variants={dashKpiChild}>
          <KpiCard icon={Landmark}     label="Banque famille"          value={familyBankBalance}      tone="bank"    href="/staff/stats"        loading={loading} isAmount />
        </motion.div>
      </motion.div>

      {/* ── Mini-chat Assistant Règlement (même moteur que /reglement Discord) ── */}
      <ReglementQuickChat fullToolHref="/staff/reglement" />

      {/* Staff LYG connectés en jeu (discret) */}
      <StaffOnlineStrip />

      {/* ── Content grid ── */}
      <motion.div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        variants={dashSectionFade}
        initial="hidden"
        animate="visible"
        custom={0.18}
      >

        {/* Mon solde bancaire personnel (positif / négatif d'un coup d'œil) */}
        <Section title="Mon solde bancaire" icon={Landmark} href="/banque" linkLabel="Détails">
          <div className="p-4">
            {personalBalance === undefined ? (
              <SectionSkeleton />
            ) : personalBalance === null ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                Ton compte staff n&apos;est pas lié à une fiche membre — solde personnel indisponible.
              </div>
            ) : (() => {
              const positive = personalBalance >= 0;
              return (
                <div className={`flex items-center gap-4 rounded-2xl border p-5 ${positive ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.04]" : "border-red-500/45 bg-gradient-to-br from-red-500/[0.18] to-red-500/[0.06]"}`}>
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${positive ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                    <Landmark className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Mon solde personnel</p>
                    <p className={`mt-0.5 text-2xl font-bold tabular-nums sm:text-3xl ${positive ? "text-emerald-300" : "text-red-300"}`}>
                      {positive ? "+" : "−"}{Math.abs(personalBalance).toLocaleString("fr-FR")} €
                    </p>
                    <p className={`mt-0.5 text-xs font-medium ${positive ? "text-emerald-400/80" : "text-red-400/90"}`}>
                      {positive ? "✓ Solde positif" : "⚠ Solde négatif — déficit"}
                    </p>
                  </div>
                </div>
              );
            })()}
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
                  <p className="text-[11px] text-slate-600">{formatAppDate(rec.createdAt)}</p>
                </div>
                <StatusBadge tone={isRecruitmentPending(rec.status) ? "warning" : "neutral"} className="shrink-0 text-[11px]">
                  {isRecruitmentPending(rec.status) ? "En attente" : "Clôturé"}
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
                    <p className="text-[11px] text-slate-600">{formatAppDate(comp.createdAt)}</p>
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
            debtorsArr.map((d: any) => (
              <ListRow key={d.steamId} href={`/staff/banklogs?steamId=${d.steamId}`}>
                <DebtorAvatar url={d.discordId ? debtorAvatars.get(d.discordId) : null} name={d.rpName} />
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
                  <p className="text-[11px] text-slate-600">{formatAppDate(abs.createdAt)}</p>
                </div>
                <StatusBadge tone="warning" className="shrink-0 text-[11px]">En attente</StatusBadge>
              </ListRow>
            ))
          )}
        </Section>

      </motion.div>
    </PageShell>
  );
}
