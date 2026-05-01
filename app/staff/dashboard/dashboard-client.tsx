"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge-new";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { PageShell } from "@/components/staff/ui/PageShell";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import {
  AlertCircle,
  Users,
  FileText,
  Ban,
  ArrowRight,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { MotionButtonFrame, MotionListItem } from "@/components/staff/ui/motion";
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
  type: string;
  status: "ACTIVE" | "EXPIRED" | "CLOSED";
  reason: string | null;
  createdAt: string;
};

function fmtDate(iso: string | null) {
  return formatAppDate(iso);
}

function getComplaintBadge(status: string) {
  const styles: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    OPEN: { variant: "destructive", label: "🔴 Ouvert" },
    IN_REVIEW: { variant: "default", label: "🔵 En cours" },
    RESOLVED: { variant: "secondary", label: "✅ Traitée" },
    REJECTED: { variant: "destructive", label: "❌ Refusée" },
    CLOSED: { variant: "outline", label: "⊘ Clôturé" },
  };
  return styles[status] || styles.OPEN;
}

function getComplaintLabel(complaint: Complaint) {
  if (complaint.ticketKey?.trim()) return `Plainte ${complaint.ticketKey.trim()}`;
  return `Plainte #${complaint.id.slice(-4)}`;
}

function getRecruitmentBadge(status: string) {
  return status === "OPEN"
    ? { variant: "outline" as const, label: "⏳ En attente" }
    : { variant: "secondary" as const, label: "✓ Clôturé" };
}

function getSanctionBadge(status: string) {
  const styles: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    ACTIVE: { variant: "destructive", label: "⚠️ Active" },
    EXPIRED: { variant: "outline", label: "⏱️ Expirée" },
    CLOSED: { variant: "secondary", label: "✓ Clôturée" },
  };
  return styles[status] || styles.ACTIVE;
}

export default function StaffDashboardClient() {
  const { data, loading, error, refresh } = useDashboardData();

  // Destructure from data
  const { complaints, recruitments, sanctions, pendingAbsences, membersCount, membersSource, membersError } = data;

  // Sécuriser avec des versions garanties en tableaux
  const complaintsArr = Array.isArray(complaints) ? complaints : [];
  const recruitmentsArr = Array.isArray(recruitments) ? recruitments : [];
  const sanctionsArr = Array.isArray(sanctions) ? sanctions : [];
  const pendingAbsencesArr = Array.isArray(pendingAbsences) ? pendingAbsences : [];

  const stats = [
    { icon: AlertCircle, label: "Plaintes ouvertes", value: complaintsArr.length, tone: "warning" as const },
    { icon: FileText, label: "Recrutements en attente", value: recruitmentsArr.length, tone: "info" as const },
    { icon: Ban, label: "Sanctions actives", value: sanctionsArr.length, tone: "danger" as const },
    { icon: Users, label: "Membres actifs", value: membersCount, tone: "success" as const },
  ];

  return (
    <PageShell
      title="Dashboard"
      description="Vue d'ensemble staff des flux prioritaires et des actions à traiter."
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
            {loading ? "Chargement..." : "Rafraîchir"}
          </Button>
        </MotionButtonFrame>
      }
    >

      {/* Members Source Warning */}
      {membersSource === "db_stale" && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-100">
                Données membres en mode fallback
              </h3>
              <p className="mt-1 text-xs text-amber-100/80">
                La source externe (LYG) est temporairement indisponible. Les données affichées proviennent de la base de données locale et peuvent être légèrement obsolètes.
              </p>
              {membersError && (
                <p className="mt-1 font-mono text-xs text-amber-200/90">
                  Erreur: {membersError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Error */}
      {error && !membersSource && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-300" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-100">Erreur de chargement</h3>
              <p className="mt-1 text-xs text-red-100/80">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="info">Source membres: {membersSource || "live"}</StatusBadge>
        {error ? <StatusBadge tone="danger">Données partielles</StatusBadge> : <StatusBadge tone="success">Flux dashboard actifs</StatusBadge>}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <DataTile
              key={idx}
              label={stat.label}
              className="min-h-[108px]"
              value={
                <div className="flex min-h-[2.75rem] items-center justify-between gap-3">
                  <div className="text-4xl font-bold tracking-tight text-slate-50">
                    {loading ? <Skeleton className="h-8 w-14" /> : stat.value}
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                    stat.tone === "warning" ? "border-amber-500/30 bg-amber-500/12" :
                    stat.tone === "danger" ? "border-red-500/30 bg-red-500/12" :
                    stat.tone === "success" ? "border-emerald-500/30 bg-emerald-500/12" :
                    "border-[#9b2335]/30 bg-[#9b2335]/12"
                  }`}>
                    <Icon className={`h-6 w-6 ${
                      stat.tone === "warning" ? "text-amber-300" :
                      stat.tone === "danger" ? "text-red-300" :
                      stat.tone === "success" ? "text-emerald-300" :
                      "text-rose-300"
                    }`} />
                  </div>
                </div>
              }
              tone={stat.tone}
            />
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:auto-rows-fr">
        {/* Urgent Actions */}
        <DashboardSection
          title="🚨 Actions urgentes"
          description="Choses à faire en priorité"
        >
          <div className="flex min-h-[180px] flex-1 flex-col gap-2">
            {complaintsArr.filter(c => c.status === "OPEN").length > 0 && (
              <MotionListItem>
                <Link
                  href="/staff/complaints"
                  className="block rounded-[20px] border border-red-500/20 bg-red-500/[0.08] p-4 text-red-100 transition hover:bg-red-500/[0.12]"
                >
                  <div className="font-semibold">📝 {complaintsArr.filter(c => c.status === "OPEN").length} plainte(s) ouverte(s)</div>
                  <div className="text-sm text-red-100/80">Cliquez pour traiter les plaintes en attente</div>
                </Link>
              </MotionListItem>
            )}
            {recruitmentsArr.filter(r => r.status === "OPEN").length > 0 && (
              <MotionListItem>
                <Link
                  href="/staff/recruitment"
                  className="block rounded-[20px] border border-amber-500/20 bg-amber-500/[0.08] p-4 text-amber-100 transition hover:bg-amber-500/[0.12]"
                >
                  <div className="font-semibold">👥 {recruitmentsArr.filter(r => r.status === "OPEN").length} recrutement(s) à décider</div>
                  <div className="text-sm text-amber-100/80">Cliquez pour voir les candidatures en attente</div>
                </Link>
              </MotionListItem>
            )}
            {sanctionsArr.filter(s => s.status === "ACTIVE").length > 0 && (
              <MotionListItem>
                <Link
                  href="/staff/sanctions"
                  className="block rounded-[20px] border border-amber-500/20 bg-amber-500/[0.08] p-4 text-amber-100 transition hover:bg-amber-500/[0.12]"
                >
                  <div className="font-semibold">⚖️ {sanctionsArr.filter(s => s.status === "ACTIVE").length} sanction(s) à surveiller</div>
                  <div className="text-sm text-amber-100/80">Cliquez pour gérer les sanctions actives</div>
                </Link>
              </MotionListItem>
            )}
            {pendingAbsencesArr.length > 0 && (
              <MotionListItem>
                <Link
                  href="/staff/absences"
                  className="block rounded-[20px] border border-blue-500/20 bg-blue-500/[0.08] p-4 text-blue-100 transition hover:bg-blue-500/[0.12]"
                >
                  <div className="font-semibold">📅 {pendingAbsencesArr.length} absence(s) en attente de validation</div>
                  <div className="text-sm text-blue-100/80">Cliquez pour valider ou rejeter les absences</div>
                </Link>
              </MotionListItem>
            )}
            {complaintsArr.length === 0 && recruitmentsArr.length === 0 && sanctionsArr.length === 0 && pendingAbsencesArr.length === 0 && (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  icon={<TrendingUp className="h-12 w-12" />}
                  title="Tout est à jour"
                  description="Aucune action urgente n'est requise pour le moment."
                />
              </div>
            )}
          </div>
        </DashboardSection>

        {/* Recent Recruitments */}
        <DashboardSection
          title="Recrutements en attente"
          description="Dernières demandes d'intégration"
        >
          <div className="flex min-h-[180px] flex-1 flex-col rounded-lg border border-border bg-card/30 overflow-hidden">
            <div className="flex flex-1 flex-col divide-y divide-border">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : recruitmentsArr.length > 0 ? (
                <>
                  {recruitmentsArr.map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {rec.rpName || rec.ticketKey}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {fmtDate(rec.createdAt)}
                        </p>
                      </div>
                      <Badge
                        variant={getRecruitmentBadge(rec.status).variant}
                        className="ml-2 flex-shrink-0"
                      >
                        {getRecruitmentBadge(rec.status).label}
                      </Badge>
                    </div>
                  ))}
                  <div className="px-4 py-3 border-t border-border bg-muted/20">
                    <Button variant="ghost" size="sm" className="w-full" asChild>
                      <Link href="/staff/recruitment">
                        Voir tous les recrutements
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
                  Aucun recrutement en attente
                </div>
              )}
            </div>
          </div>
        </DashboardSection>

        {/* Recent Sanctions */}
        <DashboardSection
          title="Sanctions actives"
          description="Sanctions en cours et à surveiller"
        >
          <div className="flex min-h-[180px] flex-1 flex-col rounded-lg border border-border bg-card/30 overflow-hidden">
            <div className="flex flex-1 flex-col divide-y divide-border">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : sanctionsArr.length > 0 ? (
                <>
                  {sanctionsArr.map((sanc) => (
                    <div
                      key={sanc.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">
                          {sanc.type}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {sanc.reason || "Aucune raison"}
                        </p>
                      </div>
                      <Badge
                        variant={getSanctionBadge(sanc.status).variant}
                        className="ml-2 flex-shrink-0"
                      >
                        {getSanctionBadge(sanc.status).label}
                      </Badge>
                    </div>
                  ))}
                  <div className="px-4 py-3 border-t border-border bg-muted/20">
                    <Button variant="ghost" size="sm" className="w-full" asChild>
                      <Link href="/staff/sanctions">
                        Voir toutes les sanctions
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
                  Aucune sanction active
                </div>
              )}
            </div>
          </div>
        </DashboardSection>
        <DashboardSection
          title="Plaintes ouvertes"
          description="Plaintes en attente de traitement"
        >
          <div className="flex min-h-[180px] flex-1 flex-col rounded-lg border border-border bg-card/30 overflow-hidden">
            <div className="flex flex-1 flex-col divide-y divide-border">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : complaintsArr.length > 0 ? (
                <>
                  {complaintsArr.map((comp) => (
                    <div
                      key={comp.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">
                          {getComplaintLabel(comp)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {fmtDate(comp.createdAt)}
                        </p>
                      </div>
                      <Badge variant={getComplaintBadge(comp.status).variant}>
                        {getComplaintBadge(comp.status).label}
                      </Badge>
                    </div>
                  ))}
                  <div className="px-4 py-3 border-t border-border bg-muted/20">
                    <Button variant="ghost" size="sm" className="w-full" asChild>
                      <Link href="/staff/complaints">
                        Voir toutes les plaintes
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
                  Aucune plainte ouverte
                </div>
              )}
            </div>
          </div>
        </DashboardSection>
      </div>
    </PageShell>
  );
}

function DashboardSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <SectionCard title={title} description={description} className="flex h-full min-h-[180px] flex-col">
      <div className="flex flex-1 flex-col">
        {children}
      </div>
    </SectionCard>
  );
}
