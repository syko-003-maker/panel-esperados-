"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ShieldCheck, Crown, Info } from "lucide-react";
import { SectionCard } from "@/components/staff/ui/SectionCard";

type Row = {
  id: string;
  rpName: string | null;
  discordId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  inGuild: boolean;
  rolesUpdatedAt: string | null;
  isChef: boolean;
  isSousChef: boolean;
  isEtatMajor: boolean;
  isEncadrant: boolean;
  isRecruteur: boolean;
};

type ManagedRole = "ETAT_MAJOR" | "ENCADRANT" | "RECRUTEUR";

const ROLE_META: Record<ManagedRole, { label: string; on: string; off: string }> = {
  ETAT_MAJOR: {
    label: "État-Major",
    on: "border-rose-500/50 bg-rose-500/15 text-rose-200",
    off: "border-white/10 bg-white/[0.03] text-slate-500 hover:border-rose-500/30 hover:text-rose-300/70",
  },
  ENCADRANT: {
    label: "Encadrant",
    on: "border-sky-500/50 bg-sky-500/15 text-sky-200",
    off: "border-white/10 bg-white/[0.03] text-slate-500 hover:border-sky-500/30 hover:text-sky-300/70",
  },
  RECRUTEUR: {
    label: "Recruteur",
    on: "border-emerald-500/50 bg-emerald-500/15 text-emerald-200",
    off: "border-white/10 bg-white/[0.03] text-slate-500 hover:border-emerald-500/30 hover:text-emerald-300/70",
  },
};

function accessLabel(r: Row): { label: string; cls: string } {
  if (r.isChef) return { label: "Chef famille", cls: "text-amber-300" };
  if (r.isSousChef) return { label: "Sous-Chef", cls: "text-amber-200" };
  if (r.isEtatMajor) return { label: "État-Major", cls: "text-rose-300" };
  if (r.isEncadrant) return { label: "Encadrant", cls: "text-sky-300" };
  if (r.isRecruteur) return { label: "Recruteur", cls: "text-emerald-300" };
  return { label: "Membre", cls: "text-slate-500" };
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function AccessAvatar({ row }: { row: Row }) {
  const [failed, setFailed] = useState(false);
  const name = row.rpName ?? row.displayName ?? "?";
  if (row.avatarUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={row.avatarUrl}
        alt={name}
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/15"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-bold text-slate-300 ring-1 ring-white/15">
      {initialsOf(name)}
    </div>
  );
}

function freshness(iso: string | null): string {
  if (!iso) return "jamais synchronisé";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.round(mins / 60);
  return `il y a ${h} h`;
}

export default function AccessClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // clé "discordId:role" en cours d'application (toggle) / discordId en resync
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [resyncing, setResyncing] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/settings/access", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec du chargement");
      setRows(json.members ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (r.rpName?.toLowerCase().includes(q) ?? false) ||
        (r.displayName?.toLowerCase().includes(q) ?? false) ||
        (r.discordId?.includes(q) ?? false)
    );
  }, [rows, search]);

  const holders = rows.filter(
    (r) => r.isChef || r.isSousChef || r.isEtatMajor || r.isEncadrant || r.isRecruteur
  ).length;

  async function toggleRole(row: Row, role: ManagedRole, current: boolean) {
    if (!row.discordId) return;
    const key = `${row.discordId}:${role}`;
    if (pending.has(key)) return;

    setPending((p) => new Set(p).add(key));
    setError(null);
    // Optimiste : on reflète tout de suite, on annule si l'API refuse.
    const flag =
      role === "ETAT_MAJOR" ? "isEtatMajor" : role === "ENCADRANT" ? "isEncadrant" : "isRecruteur";
    setRows((rs) => rs.map((r) => (r.discordId === row.discordId ? { ...r, [flag]: !current } : r)));

    try {
      const res = await fetch("/api/staff/settings/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_ROLE", discordId: row.discordId, role, enabled: !current }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec de l'application du rôle");
    } catch (err: unknown) {
      // rollback
      setRows((rs) => rs.map((r) => (r.discordId === row.discordId ? { ...r, [flag]: current } : r)));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  }

  async function resyncOne(row: Row) {
    if (!row.discordId || resyncing.has(row.discordId)) return;
    setResyncing((s) => new Set(s).add(row.discordId!));
    setError(null);
    try {
      const res = await fetch("/api/staff/settings/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RESYNC", discordId: row.discordId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec de la resync");
      if (json.member) {
        setRows((rs) => rs.map((r) => (r.discordId === row.discordId ? json.member : r)));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResyncing((s) => {
        const n = new Set(s);
        n.delete(row.discordId!);
        return n;
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Comment ça marche */}
      <div className="flex items-start gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm text-sky-100/90">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
        <p className="leading-6">
          Les accès au panel sont pilotés par les <strong>rôles Discord</strong>. Activer ou retirer un
          rôle ici l&apos;applique <strong>directement sur Discord</strong> (quelques secondes), puis
          l&apos;accès se met à jour partout automatiquement. Si un accès semble incohérent, utilise{" "}
          <strong>Resync</strong> sur la ligne du membre.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <SectionCard
        title="Rôles d'accès"
        description={`${holders} membre${holders > 1 ? "s" : ""} avec un accès panel · ${rows.length} membres actifs`}
        icon={ShieldCheck}
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un membre (nom RP, pseudo, ID)…"
              className="w-full rounded-xl border border-white/10 bg-[hsl(var(--sunset-surface)/0.85)] py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
            />
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">Chargement…</div>
          ) : visible.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">Aucun membre trouvé.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {visible.map((row) => {
                const lvl = accessLabel(row);
                const isLeader = row.isChef || row.isSousChef;
                return (
                  <div
                    key={row.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/[0.04] lg:flex-row lg:items-center"
                  >
                    {/* Identité */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <AccessAvatar row={row} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-100">
                            {row.rpName ?? row.displayName ?? row.discordId}
                          </span>
                          {isLeader && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-px text-[10px] font-bold uppercase tracking-wide text-amber-300">
                              <Crown className="h-2.5 w-2.5" />
                              {row.isChef ? "Chef" : "Sous-Chef"}
                            </span>
                          )}
                          {!row.inGuild && (
                            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-px text-[10px] font-semibold text-red-300">
                              Hors Discord
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">
                          {row.displayName && row.displayName !== row.rpName ? `@${row.displayName} · ` : ""}
                          Accès : <span className={lvl.cls}>{lvl.label}</span>
                          {" · "}
                          <span title={row.rolesUpdatedAt ?? undefined}>sync {freshness(row.rolesUpdatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Toggles + resync */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {(Object.keys(ROLE_META) as ManagedRole[]).map((role) => {
                        const meta = ROLE_META[role];
                        const on =
                          role === "ETAT_MAJOR"
                            ? row.isEtatMajor
                            : role === "ENCADRANT"
                              ? row.isEncadrant
                              : row.isRecruteur;
                        const key = `${row.discordId}:${role}`;
                        const busy = pending.has(key);
                        return (
                          <button
                            key={role}
                            type="button"
                            disabled={busy || !row.inGuild || !row.discordId}
                            onClick={() => toggleRole(row, role, on)}
                            title={
                              !row.inGuild
                                ? "Membre absent du Discord"
                                : on
                                  ? `Retirer le rôle ${meta.label}`
                                  : `Donner le rôle ${meta.label}`
                            }
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                              on ? meta.on : meta.off
                            } ${busy ? "animate-pulse" : ""}`}
                          >
                            {meta.label}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        disabled={!row.discordId || resyncing.has(row.discordId ?? "")}
                        onClick={() => resyncOne(row)}
                        title="Resynchroniser depuis Discord (rôles + pseudo)"
                        className="ml-1 rounded-full border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 transition-colors hover:border-white/25 hover:text-slate-200 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${resyncing.has(row.discordId ?? "") ? "animate-spin" : ""}`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Niveaux d'accès" description="Ce que chaque rôle permet sur le panel.">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
            <span className="font-semibold text-amber-300">Chef / Sous-Chef</span>
            <p className="mt-0.5 text-xs leading-5 text-slate-400">
              Tout, y compris WL famille (rangs/armes), cookie LYG et cette page. Non modifiable ici
              (rôle Discord à gérer à la main, par sécurité).
            </p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
            <span className="font-semibold text-rose-300">État-Major</span>
            <p className="mt-0.5 text-xs leading-5 text-slate-400">
              Tout le panel staff en écriture (sanctions, plaintes, réunions, absences) — sauf WL
              famille live et cookie LYG.
            </p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
            <span className="font-semibold text-sky-300">Encadrant</span>
            <p className="mt-0.5 text-xs leading-5 text-slate-400">
              Tout le panel staff en lecture seule — les actions sensibles sont masquées/bloquées.
            </p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
            <span className="font-semibold text-emerald-300">Recruteur</span>
            <p className="mt-0.5 text-xs leading-5 text-slate-400">
              Dashboard + module Recrutement uniquement (sidebar réduite).
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
