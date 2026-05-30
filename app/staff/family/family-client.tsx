"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Crown,
  ExternalLink,
  RefreshCw,
  Search,
  Swords,
  Trash2,
  UserPlus,
} from "lucide-react";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/staff/ui/use-confirm";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";

type Row = {
  id: string;
  steamId: string | null;
  discordId: string | null;
  rpName: string | null;
  grade: string | null;
  rankLabel: string | null;
  discordAvatarHash: string | null;
  wlClass: number | null;
  wlOwner: boolean;
  wlClassIntent: number | null;
  wlOwnerIntent: boolean;
  wlIntentUpdatedAt: string | null;
  wlIntentBy: string | null;
  hasClassDiff: boolean;
  hasOwnerDiff: boolean;
  hasAnyDiff: boolean;
};

const LYG_ADMIN_URL = "https://families.lyg.fr/pages/dashboard.php";

type CookieState = {
  configured: boolean;
  expired: boolean;
  ownerDiscordId: string | null;
  ownerName: string | null;
};

function classTone(rank: number | null): "success" | "info" | "warning" | "danger" | "neutral" {
  if (rank === null) return "neutral";
  if (rank === 1) return "success";
  if (rank === 2) return "info";
  if (rank === 3) return "warning";
  return "danger";
}

function classLabel(rank: number | null): string {
  if (rank === null) return "—";
  if (rank === 1) return "Chef · WL 1";
  return `WL ${rank}`;
}

export default function FamilyClient({
  canWrite,
  canManageRanks = false,
  liveMode = false,
  cookieState,
}: {
  canWrite: boolean;
  /**
   * true si l'utilisateur peut faire des Up/Down (= Chef famille ou Sous-Chef
   * famille). L'EM peut accéder à la page mais n'a accès qu'à Remove (failsafe)
   * et Add. Ce flag est calculé côté server via isCurrentSessionChefFamille.
   */
  canManageRanks?: boolean;
  /** true si un cookie LYG est configuré ET appartient au caller. */
  liveMode?: boolean;
  cookieState?: CookieState;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/family/members", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Échec du chargement");
      setRows(json.rows ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Refresh auto toutes les 60s tant qu'on est sur la page — utile car
    // la sync LYG tourne en arrière-plan toutes les 3 min.
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  /**
   * Mise à jour de l'intent (mode planif). Stocke en DB sans toucher LYG.
   */
  async function patchIntent(
    id: string,
    patch: { wlClassIntent?: number | null; wlOwnerIntent?: boolean }
  ) {
    if (!canWrite) return;
    setBusyId(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/staff/family/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Échec");
      await load();
      setSuccess("Intent mis à jour");
      window.setTimeout(() => setSuccess(null), 2200);
    } catch (err: any) {
      setError(err?.message ?? "Erreur réseau");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Action LIVE : appelle families.lyg.fr via le proxy serveur (avec le
   * cookie chiffré). Effet immédiat sur LYG, pas besoin d'aller appliquer
   * à la main. Requires liveMode = true.
   */
  async function lygAction(opts: {
    rowId: string;
    steamId: string;
    action: "up" | "down" | "remove" | "add";
    currentClass?: number;
  }) {
    if (!canWrite || !liveMode) return;
    setBusyId(opts.rowId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/staff/family/lyg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: opts.action,
          steamId: opts.steamId,
          currentClass: opts.currentClass,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message ?? json?.error ?? "Action LYG échouée");
      }
      await load();
      setSuccess("Action appliquée sur LYG ✓");
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (err: any) {
      setError(err?.message ?? "Erreur réseau");
    } finally {
      setBusyId(null);
    }
  }

  /** Routeur : choisit entre intent (planif) et LYG (live). */
  async function doRankUp(row: Row) {
    if (liveMode && row.steamId && row.wlClass !== null) {
      await lygAction({ rowId: row.id, steamId: row.steamId, action: "up", currentClass: row.wlClass });
    } else {
      // WL 1 (Chef) → 4 (plus bas), pas de WL5.
      const next = (row.wlClassIntent ?? row.wlClass ?? 4) - 1;
      await patchIntent(row.id, { wlClassIntent: Math.max(1, next) });
    }
  }
  async function doRankDown(row: Row) {
    if (liveMode && row.steamId && row.wlClass !== null) {
      await lygAction({ rowId: row.id, steamId: row.steamId, action: "down", currentClass: row.wlClass });
    } else {
      const next = (row.wlClassIntent ?? row.wlClass ?? 1) + 1;
      await patchIntent(row.id, { wlClassIntent: Math.min(4, next) });
    }
  }
  async function doRemove(row: Row) {
    if (liveMode && row.steamId) {
      await lygAction({ rowId: row.id, steamId: row.steamId, action: "remove" });
    } else {
      await patchIntent(row.id, { wlClassIntent: null, wlOwnerIntent: false });
    }
  }
  async function doAdd(row: Row) {
    if (liveMode && row.steamId) {
      await lygAction({ rowId: row.id, steamId: row.steamId, action: "add" });
    } else {
      // LYG ajoute en classe 4 par défaut (cohérent avec la route /lyg).
      await patchIntent(row.id, { wlClassIntent: 4 });
    }
  }

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.rpName ?? "").toLowerCase().includes(q) ||
      (r.steamId ?? "").includes(q) ||
      (r.discordId ?? "").includes(q)
    );
  });

  const pendingCount = rows.filter((r) => r.hasAnyDiff).length;
  const ownerCount = rows.filter((r) => r.wlOwnerIntent).length;
  const byClass = (n: number) => rows.filter((r) => r.wlClassIntent === n).length;

  return (
    <div className="grid gap-6">
      {confirmDialog}

      {/* ── Top tiles ─────────────────────────────────────────────── */}
      <SectionCard
        title="Famille Los Esperados"
        description="Vue d'ensemble des membres WL planifiés via le panel. La couleur indique le rang."
        icon={Crown}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {liveMode ? (
              <StatusBadge tone="success">⚡ Mode live</StatusBadge>
            ) : cookieState?.configured && cookieState.expired ? (
              <a
                href="/staff/settings/lyg-cookie"
                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/35 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/22"
              >
                Cookie LYG expiré
              </a>
            ) : !cookieState?.configured ? (
              <a
                href="/staff/settings/lyg-cookie"
                className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/15"
              >
                Activer le mode live
              </a>
            ) : (
              <StatusBadge tone="warning">
                Mode planif · {cookieState.ownerName ?? cookieState.ownerDiscordId} a le cookie
              </StatusBadge>
            )}
            <MotionButtonFrame>
              <Button
                onClick={() => void load()}
                disabled={loading}
                variant="outline"
                size="sm"
                className="rounded-2xl border-white/10 bg-white/[0.04]"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Rafraîchir
              </Button>
            </MotionButtonFrame>
            <a
              href="/staff/family/weapons"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.1]"
            >
              <Swords className="h-4 w-4" />
              Armes par classe
            </a>
            <a
              href={LYG_ADMIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/15"
            >
              <ExternalLink className="h-4 w-4" />
              Ouvrir families.lyg.fr
            </a>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <DataTile label="Membres" value={rows.length} tone="info" />
          <DataTile label="Owners" value={ownerCount} tone={ownerCount > 0 ? "success" : "default"} />
          <DataTile label="WL 1 (Chef)" value={byClass(1)} tone="success" />
          <DataTile label="WL 2" value={byClass(2)} tone="info" />
          <DataTile label="WL 3-4" value={byClass(3) + byClass(4)} tone="warning" />
          <DataTile
            label="À appliquer LYG"
            value={pendingCount}
            tone={pendingCount > 0 ? "danger" : "success"}
          />
        </div>

        {/* Banner diff si > 0 */}
        {pendingCount > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#9b2335]/35 bg-gradient-to-r from-[#7a1f2b]/20 via-[#7a1f2b]/12 to-transparent px-4 py-3">
            <p className="text-sm text-amber-100">
              <strong>{pendingCount}</strong> changement{pendingCount > 1 ? "s" : ""} planifié{pendingCount > 1 ? "s" : ""} —
              à reporter sur <span className="font-mono text-amber-200">families.lyg.fr</span> pour synchroniser.
            </p>
            <a
              href={LYG_ADMIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-500/25"
            >
              Aller appliquer <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : null}

        {!canWrite ? (
          <div className="mt-4 rounded-2xl border border-cyan-500/25 bg-cyan-500/8 px-4 py-3 text-sm text-cyan-100">
            🛈 Lecture seule pour ton rôle. Seuls les Chefs / Sous-Chefs / État-Major peuvent modifier l'intent WL.
          </div>
        ) : !canManageRanks ? (
          <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-100">
            🛈 Tu peux <strong>ajouter</strong> ou <strong>retirer</strong> un membre (failsafe), mais
            seuls le <strong>Chef famille</strong> et le <strong>Sous-Chef famille</strong> peuvent reclasser
            les WL (boutons Up/Down). Pour retirer quelqu'un, préfère passer par une <strong>sanction</strong>
            (DEMOTE/BLACKLIST) qui retire automatiquement la WL.
          </div>
        ) : null}
      </SectionCard>

      {/* ── Liste ────────────────────────────────────────────────── */}
      <SectionCard
        title="Membres WL"
        description="Cliquer sur Rank+ / Rank- pour planifier un changement. Le diff est mis en évidence."
      >
        {/* Recherche */}
        <div className="mb-4 flex items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (RP, SteamID, Discord ID)…"
              className="rounded-xl border-white/10 bg-white/[0.04] pl-10"
            />
          </div>
          <span className="text-xs text-slate-500">{filtered.length} affichés</span>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            ✓ {success}
          </div>
        ) : null}

        {loading && rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Chargement…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="Aucun membre"
            description="La sync LYG n'a encore rien remonté, ou tous filtrés."
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((row) => {
              const avatarUrl =
                row.discordId && row.discordAvatarHash
                  ? getDiscordAvatarUrl(row.discordId, row.discordAvatarHash)
                  : null;
              const liveLabel = classLabel(row.wlClass);
              const intentLabel = classLabel(row.wlClassIntent);
              const ownerLive = row.wlOwner;
              const ownerIntent = row.wlOwnerIntent;
              const intentClass = row.wlClassIntent;
              // Up/Down : réservé Chef Famille + Sous-Chef Famille (canManageRanks).
              // Add/Remove : tout writer (canWrite = Chef + Sous-Chef + EM).
              const canRankUp = canWrite && canManageRanks && intentClass !== null && intentClass > 1;
              const canRankDown = canWrite && canManageRanks && intentClass !== null && intentClass < 5;
              const canAdd = canWrite && intentClass === null;
              const canRemove = canWrite && intentClass !== null;

              return (
                <li
                  key={row.id}
                  className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                    row.hasAnyDiff
                      ? "border-amber-500/30 bg-amber-500/[0.04]"
                      : "border-white/8 bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Avatar */}
                  <div className="flex flex-shrink-0 items-center gap-3">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-10 w-10 rounded-full border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#7a1f2b]/40 text-xs font-bold text-amber-200">
                        {(row.rpName ?? "?").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-100">
                          {row.rpName ?? "Sans nom"}
                        </span>
                        {ownerIntent ? (
                          <Crown className="h-3.5 w-3.5 text-amber-300 drop-shadow-[0_0_6px_rgba(212,175,55,0.55)]" />
                        ) : null}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {row.rankLabel ? row.rankLabel : "—"} · {row.steamId ?? "no steam"}
                      </div>
                    </div>
                  </div>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {/* Badges état */}
                    <div className="flex flex-col items-end gap-0.5 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <span>LYG :</span>
                        <StatusBadge tone={classTone(row.wlClass)}>{liveLabel}</StatusBadge>
                      </div>
                      {row.hasAnyDiff ? (
                        <div className="flex items-center gap-1.5">
                          <span>Intent :</span>
                          <StatusBadge tone={classTone(intentClass)}>{intentLabel}</StatusBadge>
                        </div>
                      ) : null}
                    </div>

                    {/* Boutons d'action */}
                    {canWrite ? (
                      <div className="flex items-center gap-1">
                        {canAdd ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => doAdd(row)}
                            className="rounded-xl border-emerald-500/30 bg-emerald-500/10 px-2 text-emerald-100 hover:bg-emerald-500/15"
                            title={liveMode ? "Ajouter à la famille via LYG (live)" : "Planifier ajout famille"}
                          >
                            <UserPlus className="mr-1 h-3.5 w-3.5" />
                            Ajouter
                          </Button>
                        ) : null}
                        {canRankUp ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => doRankUp(row)}
                            className="rounded-xl border-emerald-500/30 bg-emerald-500/10 px-2 text-emerald-100 hover:bg-emerald-500/15"
                            title={liveMode ? "Up rank (LYG live)" : "Up rank (planifié)"}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {canRankDown ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => doRankDown(row)}
                            className="rounded-xl border-amber-500/30 bg-amber-500/10 px-2 text-amber-100 hover:bg-amber-500/15"
                            title={liveMode ? "Down rank (LYG live)" : "Down rank (planifié)"}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {/* Toggle Owner — uniquement en mode planif, LYG admin
                            n'expose pas d'endpoint pour ce flag */}
                        {!liveMode ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => patchIntent(row.id, { wlOwnerIntent: !ownerIntent })}
                            className={`rounded-xl px-2 ${
                              ownerIntent
                                ? "border-amber-500/40 bg-amber-500/15 text-amber-50 hover:bg-amber-500/25"
                                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                            }`}
                            title={ownerIntent ? "Retirer le statut Chef famille" : "Marquer Chef famille"}
                          >
                            <Crown className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {canRemove ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Retirer ${row.rpName ?? "ce membre"} de la famille ?`,
                                description: liveMode
                                  ? "Application immédiate sur families.lyg.fr."
                                  : "L'intent passe à 'non WL'. Pense à appliquer sur families.lyg.fr ensuite.",
                                confirmLabel: "Retirer",
                                tone: "danger",
                              });
                              if (!ok) return;
                              await doRemove(row);
                            }}
                            className="rounded-xl border-red-500/30 bg-red-500/10 px-2 text-red-200 hover:bg-red-500/15"
                            title="Retirer de la famille"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Indicateur "live owner" vs "intent owner" si diff */}
                    {ownerLive !== ownerIntent ? (
                      <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                        Owner {ownerLive ? "→ retirer" : "→ ajouter"}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// Petit import différé — utilisé seulement quand la liste est vide.
function Users() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
