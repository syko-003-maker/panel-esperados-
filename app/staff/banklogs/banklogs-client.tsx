"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { PageShell } from "@/components/staff/ui/PageShell";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { SkeletonTable } from "@/components/staff/ui/Skeletons";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";
import { Button } from "@/components/ui/button";
import { RefreshCw, Database, Filter } from "lucide-react";
import { formatBanklogTime } from "@/lib/banklogs-formatter";

type BankLogItem = {
  at: string; // ISO
  type: number; // 1/2...
  money: number; // int
  steamId: string; // string
  rpName: string | null; // Member name
};

type BankLogsResponse = {
  ok: boolean;
  page: number;
  limit: number;
  total: number;
  items: BankLogItem[];
};

type SyncStateResponse = {
  ok: boolean;
  key: string;
  syncedAt: string | null;
  meta?: {
    lastAttemptAt?: string | null;
    lastSuccessAt?: string | null;
    backoffUntil?: string | null;
    lastError?: string | null;
  } | null;
  cursor?: string | null;
};

type ManualSyncResponse = {
  ok: boolean;
  reason?: string;
  backoffMs?: number;
  lastSuccessAt?: string | null;
};

/**
 * Alias for backward compatibility
 * New code should use formatBanklogTime from @/lib/banklogs-formatter
 */
const formatBrussels = formatBanklogTime;

function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-BE").format(n) + " €";
}

function formatRelativeSync(value: string | null, nowMs: number) {
  if (!value) return "—";
  const when = new Date(value).getTime();
  if (!Number.isFinite(when)) return "—";
  const diffMs = Math.max(0, nowMs - when);
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours} h`;
}

// Type 1 = Retrait (-) | Type 2 = Dépôt (+)
function typeLabel(t: number) {
  if (t === 1) return "Retrait";
  if (t === 2) return "Dépôt";
  return `Type ${t}`;
}

function signedMoney(type: number, money: number) {
  if (type === 1) return -Math.abs(money); // retrait
  if (type === 2) return Math.abs(money); // dépôt
  return money;
}

function TypeBadge({ type }: { type: number }) {
  const label = typeLabel(type);
  const isDeposit = type === 2;

  return (
    <StatusBadge tone={isDeposit ? "success" : "danger"} className="gap-2">
      <span
        className={`w-2 h-2 rounded-full ${isDeposit ? "bg-green-500" : "bg-red-500"}`}
      />
      {label}
    </StatusBadge>
  );
}

export default function BanklogsClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const [familyId] = useState("esperados");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastAttemptAt, setLastAttemptAt] = useState<string | null>(null);

  // ⚠️ État initialisé SYNCHRONEMENT depuis l'URL (pas dans un useEffect).
  // Avant : on initialisait à "" puis un useEffect lisait l'URL et faisait
  // setFilter…(). Le useEffect [filterSteamId] déclenchait alors `load()`
  // DEUX FOIS : un premier appel avec filtre vide (logs généraux) et un
  // second avec filtre rempli (logs perso). Selon la latence réseau, la
  // réponse "logs généraux" arrivait parfois APRÈS la réponse "logs perso"
  // et écrasait l'UI → on voyait les logs généraux au lieu du membre.
  // Lire l'URL ici garantit qu'on n'a JAMAIS un render initial avec filtre
  // vide quand l'URL en contient un.
  const initialUrlSteamId = sp?.get("steamId") ?? "";
  const initialUrlType    = sp?.get("type")    ?? "";
  const initialUrlMember  = sp?.get("member")  ?? "";
  const initialUrlDaysRaw = Number(sp?.get("days") ?? 0);
  const initialUrlDays    = Number.isFinite(initialUrlDaysRaw) ? initialUrlDaysRaw : 0;
  const initialUrlLimit   = Number(sp?.get("limit") ?? 0) || 50;
  const initialUrlPage    = Number(sp?.get("page")  ?? 0) || 1;

  const [page,  setPage]  = useState<number>(initialUrlPage);
  const [limit, setLimit] = useState<number>(initialUrlLimit);

  const [filterType,    setFilterType]    = useState<string>(initialUrlType);
  const [filterSteamId, setFilterSteamId] = useState<string>(initialUrlSteamId);
  const [filterMember,  setFilterMember]  = useState<string>(initialUrlMember);
  const [days,          setDays]          = useState<number>(initialUrlDays);

  const [data, setData] = useState<BankLogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string>("");
  const [nowTick, setNowTick] = useState(() => Date.now());

  function syncUrl(next?: Partial<{ page: number; limit: number; type: string; steamId: string; member: string; days: number }>) {
    const p = next?.page ?? page;
    const l = next?.limit ?? limit;
    const t = next?.type ?? filterType;
    const s = next?.steamId ?? filterSteamId;
    const m = next?.member ?? filterMember;
    const d = next?.days ?? days;

    const qs = new URLSearchParams();
    qs.set("page", String(p));
    qs.set("limit", String(l));
    if (t) qs.set("type", t);
    if (s.trim()) qs.set("steamId", s.trim());
    if (m.trim()) qs.set("member", m.trim());
    if (d > 0) qs.set("days", String(d));

    router.replace(`/staff/banklogs?${qs.toString()}`);
  }

  const totalPages = useMemo(() => {
    const total = data?.total ?? 0;
    return Math.max(1, Math.ceil(total / limit));
  }, [data?.total, limit]);

  // Token monotone pour ignorer les réponses obsolètes. Si l'utilisateur
  // clique sur un membre A puis sur un membre B avant que la réponse de A
  // n'arrive, le token de A devient < currentLoadToken et sa réponse est
  // ignorée → on n'écrase pas les logs de B.
  const loadTokenRef = useRef(0);

  async function load() {
    const myToken = ++loadTokenRef.current;
    setLoading(true);
    setError("");

    try {
      const qs = new URLSearchParams();
      qs.set("familyId", familyId);
      qs.set("page", String(page));
      qs.set("limit", String(limit));

      if (filterType) qs.set("type", filterType);
      if (filterSteamId.trim()) qs.set("steamId", filterSteamId.trim());
      if (filterMember.trim()) qs.set("member", filterMember.trim());
      if (days > 0) qs.set("days", String(days));
      qs.set("t", String(Date.now()));

      const res = await fetch(`/api/banklogs?${qs.toString()}`, { cache: "no-store" });
      const txt = await res.text();

      // Réponse obsolète (un load() plus récent est parti entre-temps) → on ignore
      if (myToken !== loadTokenRef.current) return;

      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      const json = JSON.parse(txt) as BankLogsResponse;
      if (!json?.ok) throw new Error("Réponse API invalide");

      setData(json);
    } catch (e: any) {
      // Là aussi : ne pas écraser un error/data si on est obsolète
      if (myToken !== loadTokenRef.current) return;
      setError(String(e?.message ?? e));
      setData(null);
    } finally {
      // Seul le load() le plus récent doit toggle le loading off
      if (myToken === loadTokenRef.current) setLoading(false);
    }
  }

  async function loadSyncState() {
    try {
      const res = await fetch(`/api/staff/sync-state?key=banklogs:${familyId}&t=${Date.now()}`, { cache: "no-store" });
      const txt = await res.text();
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      const j = JSON.parse(txt) as SyncStateResponse;
      setLastSync(j?.syncedAt ?? null);
      setLastAttemptAt(j?.meta?.lastAttemptAt ?? null);
    } catch {
      setLastSync(null);
      setLastAttemptAt(null);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setError("");

    try {
      const res = await fetch("/api/staff/sync/banklogs", { method: "POST" });
      const txt = await res.text();
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      let syncResult: ManualSyncResponse | null = null;
      try {
        syncResult = JSON.parse(txt) as ManualSyncResponse;
      } catch {
        syncResult = null;
      }

      if (syncResult?.ok && syncResult.reason === "BACKOFF") {
        const seconds = Math.max(0, Math.ceil(Number(syncResult.backoffMs ?? 0) / 1000));
        setError(`Sync manuelle ignoree: backoff actif (${seconds}s restantes).`);
      } else if (syncResult?.ok && syncResult.reason === "RATE_LIMIT") {
        setError("Sync manuelle ignoree: limite minimale entre deux tentatives.");
      } else if (syncResult?.ok && syncResult.reason && syncResult.reason !== "OK") {
        setError(`Sync manuelle: ${syncResult.reason}`);
      }

      setPage(1);
      syncUrl({ page: 1 });
      await load();
      await loadSyncState();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSyncing(false);
    }
  }

  // reload data à chaque changement
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, filterType, filterSteamId, filterMember, days]);

  // nowTick: tick every 15s pour mise à jour des temps relatifs
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // AUTO-REFRESH données banklogs: toutes les 60s
  useEffect(() => {
    const t = setInterval(() => {
      load().catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AUTO-REFRESH sync-state labels: toutes les 60s (dédié)
  useEffect(() => {
    loadSyncState().catch(() => {}); // appel immédiat au montage
    const t = setInterval(() => {
      loadSyncState().catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleItems = useMemo(() => data?.items ?? [], [data?.items]);
  const lastSuccessRelative = formatRelativeSync(lastSync, nowTick);
  const lastAttemptRelative = formatRelativeSync(lastAttemptAt, nowTick);

  const syncStatusLabel = lastAttemptAt
    ? `Dernier succes sync: ${lastSuccessRelative} • Dernier attempt: ${lastAttemptRelative}`
    : `Dernier succes sync: ${lastSuccessRelative}`;

  return (
    <PageShell
      title="Banklogs"
      description={`Famille: ${familyId} • Total: ${data?.total ?? "—"} • ${syncStatusLabel}${days > 0 ? ` • Periode: ${days}j` : ""}`}
      actions={
        <div className="flex gap-2">
          <Button
            onClick={syncNow}
            disabled={syncing || loading}
            variant="outline"
            size="sm"
            className="rounded-2xl border-white/10 bg-white/[0.04]"
          >
            <Database className="w-4 h-4 mr-2" />
            {syncing ? "Sync..." : "Sync maintenant"}
          </Button>
          <Button
            onClick={async () => {
              await load();
              await loadSyncState();
            }}
            disabled={loading || syncing}
            variant="outline"
            size="sm"
            className="rounded-2xl border-white/10 bg-white/[0.04]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {loading ? "Chargement..." : "Rafraîchir"}
          </Button>
        </div>
      }
    >
      {/* DEBUG BLOCK */}
      {(process.env.NODE_ENV !== "production" || sp?.get("debug") === "1") && lastSync && data?.items?.[0] ? (
        <div className="mb-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-200 text-xs font-mono">
          <div className="font-bold mb-2">🔍 DEBUG: Timezone Verification</div>
          <div className="space-y-1">
            <div>lastSync (raw): <span className="text-amber-100">{lastSync}</span></div>
            <div>lastSync (fmt): <span className="text-amber-100">{formatBrussels(lastSync)}</span></div>
            <div>lastSync TZ detected: <span className="text-amber-100">{/T.*(Z|[+-]\d{2}:?\d{2})$/.test(lastSync) ? "ISO+TZ" : "local/other"}</span></div>
            <div className="mt-2 pt-2 border-t border-amber-500/20">
              <div>firstRow.at (raw): <span className="text-amber-100">{data.items[0].at}</span></div>
              <div>firstRow.at (fmt): <span className="text-amber-100">{formatBrussels(data.items[0].at)}</span></div>
              <div>firstRow.at TZ detected: <span className="text-amber-100">{/T.*(Z|[+-]\d{2}:?\d{2})$/.test(data.items[0].at) ? "ISO+TZ" : "local/other"}</span></div>
            </div>
            <div className="mt-2 pt-2 border-t border-amber-500/20 text-amber-300">
              ✓ Match: {formatBrussels(lastSync) === formatBrussels(data.items[0].at) ? "YES (✓)" : "NO (✗ mismatch)"}
            </div>
          </div>
        </div>
      ) : null}

      {/* Filtres */}
      <SectionCard
        title="Filtres"
        description="Affinez la période, le type ou le membre ciblé sans quitter la vue consolidée."
        icon={Filter}
        actions={<StatusBadge>{loading && !data ? "—" : (data?.total ?? 0)} ligne{(data?.total ?? 0) > 1 ? "s" : ""}</StatusBadge>}
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Type</label>
            <StyledSelect
              value={filterType}
              onChange={(e) => {
                const v = e.target.value;
                setPage(1);
                setFilterType(v);
                syncUrl({ page: 1, type: v });
              }}
            >
              <option value="">Tous</option>
              <option value="1">Retrait</option>
              <option value="2">Dépôt</option>
            </StyledSelect>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">SteamID contient</label>
            <input
              value={filterSteamId}
              onChange={(e) => {
                const v = e.target.value;
                setPage(1);
                setFilterSteamId(v);
                syncUrl({ page: 1, steamId: v });
              }}
              placeholder="ex: 7656119..."
              className="rounded-xl border border-white/10 bg-[hsl(var(--sunset-surface)/0.85)] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Membre contient</label>
            <input
              value={filterMember}
              onChange={(e) => {
                const v = e.target.value;
                setPage(1);
                setFilterMember(v);
                syncUrl({ page: 1, member: v });
              }}
              placeholder="rpName / pseudo"
              className="rounded-xl border border-white/10 bg-[hsl(var(--sunset-surface)/0.85)] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Par page</label>
            <StyledSelect
              value={String(limit)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPage(1);
                setLimit(v);
                syncUrl({ page: 1, limit: v });
              }}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </StyledSelect>
          </div>
        </div>

        {/* Période */}
        <div className="flex gap-2 items-center flex-wrap mt-4">
          <span className="text-sm text-muted-foreground mr-2">Période :</span>
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              onClick={() => { setPage(1); setDays(d); syncUrl({ page: 1, days: d }); }}
              variant={days === d ? "default" : "outline"}
              size="sm"
              className={days === d ? "rounded-2xl" : "rounded-2xl border-white/10 bg-white/[0.04]"}
            >
              {d}j
            </Button>
          ))}
          <Button
            onClick={() => { setPage(1); setDays(0); syncUrl({ page: 1, days: 0 }); }}
            variant={days === 0 ? "default" : "outline"}
            size="sm"
            className={days === 0 ? "rounded-2xl" : "rounded-2xl border-white/10 bg-white/[0.04]"}
          >
            Tout
          </Button>
        </div>
      </SectionCard>

      {/* Erreur */}
      {error ? (
        <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400">
          <div className="font-bold mb-2">Erreur</div>
          <div className="text-sm whitespace-pre-wrap">{error}</div>
        </div>
      ) : null}

      {/* Table */}
      <SectionCard title="Journal banque" description="Historique consolidé des dépôts et retraits, trié par date décroissante.">
        {loading && !data ? (
          <SkeletonTable rows={5} cols={4} />
        ) : visibleItems.length === 0 ? (
          <EmptyState title="Aucun résultat" description="Aucune transaction trouvée avec ces filtres" icon={<Database className="w-16 h-16" />} />
        ) : (
          <>
          {/* ── Vue cartes mobile ── */}
          <div className="flex flex-col gap-2 md:hidden">
            {visibleItems.map((it, idx) => {
              const m = signedMoney(it.type, it.money);
              const isWithdraw = m < 0;
              return (
                <div key={`${it.at}-${it.steamId}-${idx}`} className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-base text-foreground">{it.rpName || "Non lié"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatBrussels(it.at)}</p>
                    <div className="mt-1.5"><TypeBadge type={it.type} /></div>
                  </div>
                  <span className={`shrink-0 font-bold text-lg ${isWithdraw ? "text-red-400" : "text-emerald-400"}`}>
                    {isWithdraw ? "-" : "+"}{fmtMoney(Math.abs(m))}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ── Vue tableau desktop ── */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.03]">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[42%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-white/8 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 text-right font-semibold">Montant</th>
                  <th className="px-5 py-3 font-semibold">Membre</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((it, idx) => {
                  const m = signedMoney(it.type, it.money);
                  const isWithdraw = m < 0;
                  return (
                    <tr key={`${it.at}-${it.steamId}-${it.type}-${it.money}-${idx}`} className="border-b border-white/6 hover:bg-white/[0.04]">
                      <td className="px-5 py-3 text-sm text-slate-300 whitespace-nowrap">{formatBrussels(it.at)}</td>
                      <td className="px-5 py-3"><TypeBadge type={it.type} /></td>
                      <td className={`px-5 py-3 text-right font-bold text-sm whitespace-nowrap ${isWithdraw ? "text-red-400" : "text-emerald-400"}`}>
                        {isWithdraw ? "−" : "+"}{fmtMoney(Math.abs(m))}
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-sm text-foreground truncate">{it.rpName || "Non lié"}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{it.steamId}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}


        {/* Pagination */}
        <div className="flex justify-between items-center px-4 py-3 border-t border-white/8">
          <div className="text-sm text-muted-foreground">
            Page <span className="font-bold">{page}</span> / <span className="font-bold">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            {[
              { label: "<<", target: () => 1, disabled: page <= 1 },
              { label: "<",  target: () => Math.max(1, page - 1), disabled: page <= 1 },
              { label: ">",  target: () => Math.min(totalPages, page + 1), disabled: page >= totalPages },
              { label: ">>", target: () => totalPages, disabled: page >= totalPages },
            ].map(({ label, target, disabled }) => (
              <Button
                key={label}
                onClick={() => { const p = target(); setPage(p); syncUrl({ page: p }); }}
                disabled={disabled || loading || syncing}
                variant="outline"
                size="sm"
                className="rounded-2xl border-white/10 bg-white/[0.04]"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </SectionCard>

    </PageShell>
  );
}
