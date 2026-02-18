"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge-new";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  Users,
  FileText,
  Ban,
  ArrowRight,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { PageHeader, StatCard, Section } from "@/components/staff/ui-components";
import { formatAppDate } from "@/lib/app-date-formatter";
import { useDashboardData } from "@/lib/hooks/useDashboardData";

type Complaint = {
  id: string;
  channelId: string;
  status: "OPEN" | "TREATED" | "UNTREATED" | "CLOSED";
  createdAtDiscord: string;
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
    TREATED: { variant: "secondary", label: "✅ Traité" },
    UNTREATED: { variant: "destructive", label: "❌ Refusé" },
    CLOSED: { variant: "outline", label: "⊘ Clôturé" },
  };
  return styles[status] || styles.OPEN;
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
  const { complaints, recruitments, sanctions, membersCount, membersSource, membersError } = data;

  // Sécuriser avec des versions garanties en tableaux
  const complaintsArr = Array.isArray(complaints) ? complaints : [];
  const recruitmentsArr = Array.isArray(recruitments) ? recruitments : [];
  const sanctionsArr = Array.isArray(sanctions) ? sanctions : [];

  // Log temporaire (même en prod, léger)
  if (typeof window !== "undefined") {
    (window as any).__dashShapeLogged ??= true;
    if ((window as any).__dashShapeLogged === true) {
      (window as any).__dashShapeLogged = "done";
      console.log("[DASH SHAPE]", {
        complaintsIsArray: Array.isArray(complaints),
        recruitmentsIsArray: Array.isArray(recruitments),
        sanctionsIsArray: Array.isArray(sanctions),
        complaintsType: typeof complaints,
        recruitmentsType: typeof recruitments,
        sanctionsType: typeof sanctions,
      });
    }
  }

  // Vérification de cohérence: s'assurer que les arrays ne peuvent pas être non-arrays partout
  if (!Array.isArray(complaintsArr) || !Array.isArray(recruitmentsArr) || !Array.isArray(sanctionsArr)) {
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      console.error("[DASHBOARD CRITICAL] Type mismatch after extraction", {
        complaintsIsArray: Array.isArray(complaintsArr),
        recruitmentsIsArray: Array.isArray(recruitmentsArr),
        sanctionsIsArray: Array.isArray(sanctionsArr),
        dataKeys: data ? Object.keys(data) : null,
      });
    }
    // Fallback de secours ultime
    return (
      <div className="space-y-8">
        <PageHeader 
          title="Dashboard"
          description="Vue d'ensemble complète de votre serveur en temps réel"
        />
        <div className="rounded-lg border border-red-500/50 bg-red-50/20 p-4 dark:border-red-800/50 dark:bg-red-900/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">
                ⚠️ Erreur critique de structure de données
              </h3>
              <p className="mt-1 text-xs text-red-800 dark:text-red-400">
                Les véhicules de données ne sont pas au format attendu. Consultez la console pour plus de détails.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Log de débogage pour vérifier les types au niveau du composant
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    console.log("[DASHBOARD RENDER SHAPE]", {
      dataType: typeof data,
      dataIsObject: data !== null && typeof data === "object",
      dataKeys: data ? Object.keys(data).sort() : null,
      complaintsType: typeof complaintsArr,
      complaintsIsArray: Array.isArray(complaintsArr),
      complaintsLength: complaintsArr?.length ?? "N/A",
      recruitmentsType: typeof recruitmentsArr,
      recruitmentsIsArray: Array.isArray(recruitmentsArr),
      recruitmentsLength: recruitmentsArr?.length ?? "N/A",
      sanctionsType: typeof sanctionsArr,
      sanctionsIsArray: Array.isArray(sanctionsArr),
      sanctionsLength: sanctionsArr?.length ?? "N/A",
      membersCountType: typeof membersCount,
      membersCountValue: membersCount,
      membersSourceType: typeof membersSource,
      membersSourceValue: membersSource,
    });
  }

  const stats = [
    { icon: AlertCircle, label: "Plaintes ouvertes", value: complaintsArr.length, color: "text-amber-600" },
    { icon: FileText, label: "Recrutements en attente", value: recruitmentsArr.length, color: "text-blue-600" },
    { icon: Ban, label: "Sanctions actives", value: sanctionsArr.length, color: "text-red-600" },
    { icon: Users, label: "Membres actifs", value: membersCount, color: "text-green-600" },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <PageHeader 
          title="Dashboard"
          description="Vue d'ensemble complète de votre serveur en temps réel"
        />
        <Button
          onClick={() => refresh(true)}
          disabled={loading}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Chargement..." : "Rafraîchir"}
        </Button>
      </div>

      {/* Members Source Warning */}
      {membersSource === "db_stale" && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50/20 p-4 dark:border-amber-800/50 dark:bg-amber-900/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                ⚠️ Données membres en mode fallback
              </h3>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                La source externe (LYG) est temporairement indisponible. Les données affichées proviennent de la base de données locale et peuvent être légèrement obsolètes.
              </p>
              {membersError && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 font-mono">
                  Erreur: {membersError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Error */}
      {error && !membersSource && (
        <div className="rounded-lg border border-red-500/50 bg-red-50/20 p-4 dark:border-red-800/50 dark:bg-red-900/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">
                ⚠️ Erreur de chargement
              </h3>
              <p className="mt-1 text-xs text-red-800 dark:text-red-400">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <StatCard
              key={idx}
              label={stat.label}
              value={
                loading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <span className={stat.color}>{stat.value}</span>
                )
              }
              icon={<Icon className="h-5 w-5" />}
            />
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent Actions */}
        <Section 
          title="🚨 Actions urgentes"
          description="Choses à faire en priorité"
        >
          <div className="space-y-2">
            {complaintsArr.filter(c => c.status === "OPEN").length > 0 && (
              <Link
                href="/staff/complaints"
                className="block p-4 rounded-lg border border-red-300/50 bg-red-50/20 hover:bg-red-100/30 transition text-red-900 dark:text-red-200 dark:border-red-800/50 dark:bg-red-900/10"
              >
                <div className="font-semibold">📝 {complaintsArr.filter(c => c.status === "OPEN").length} plainte(s) ouverte(s)</div>
                <div className="text-sm">Cliquez pour traiter les plaintes en attente</div>
              </Link>
            )}
            {recruitmentsArr.filter(r => r.status === "OPEN").length > 0 && (
              <Link
                href="/staff/recruitment"
                className="block p-4 rounded-lg border border-blue-300/50 bg-blue-50/20 hover:bg-blue-100/30 transition text-blue-900 dark:text-blue-200 dark:border-blue-800/50 dark:bg-blue-900/10"
              >
                <div className="font-semibold">👥 {recruitmentsArr.filter(r => r.status === "OPEN").length} recrutement(s) à décider</div>
                <div className="text-sm">Cliquez pour voir les candidatures en attente</div>
              </Link>
            )}
            {sanctionsArr.filter(s => s.status === "ACTIVE").length > 0 && (
              <Link
                href="/staff/sanctions"
                className="block p-4 rounded-lg border border-amber-300/50 bg-amber-50/20 hover:bg-amber-100/30 transition text-amber-900 dark:text-amber-200 dark:border-amber-800/50 dark:bg-amber-900/10"
              >
                <div className="font-semibold">⚖️ {sanctionsArr.filter(s => s.status === "ACTIVE").length} sanction(s) à surveiller</div>
                <div className="text-sm">Cliquez pour gérer les sanctions actives</div>
              </Link>
            )}
            {complaintsArr.length === 0 && recruitmentsArr.length === 0 && sanctionsArr.length === 0 && (
              <div className="p-4 rounded-lg border border-green-300/50 bg-green-50/20 text-green-900 dark:text-green-200 dark:border-green-800/50 dark:bg-green-900/10">
                <div className="font-semibold">✅ Tout est à jour!</div>
                <div className="text-sm">Aucune action urgente nécessaire en ce moment.</div>
              </div>
            )}
          </div>
        </Section>

        {/* Recent Recruitments */}
        <Section 
          title="Recrutements en attente"
          description="Dernières demandes d'intégration"
        >
          <div className="rounded-lg border border-border overflow-hidden bg-card/30">
            <div className="divide-y divide-border">
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
                <div className="p-8 text-center text-muted-foreground">
                  Aucun recrutement en attente
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Recent Sanctions */}
        <Section 
          title="Sanctions actives"
          description="Sanctions en cours et à surveiller"
        >
          <div className="rounded-lg border border-border overflow-hidden bg-card/30">
            <div className="divide-y divide-border">
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
                <div className="p-8 text-center text-muted-foreground">
                  Aucune sanction active
                </div>
              )}
            </div>
          </div>
        </Section>
      </div>

      {/* Complaints Section */}
      <Section
        title="Plaintes ouvertes"
        description="Plaintes en attente de traitement"
      >
        <div className="rounded-lg border border-border overflow-hidden bg-card/30">
          <div className="divide-y divide-border">
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
                        Plainte #{comp.channelId.slice(-4)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {fmtDate(comp.createdAtDiscord)}
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
              <div className="p-8 text-center text-muted-foreground">
                Aucune plainte ouverte
              </div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
