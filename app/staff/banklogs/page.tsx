"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell, SectionCard, EmptyState, SkeletonTable } from "@/components/staff/ui";
import { Button } from "@/components/ui/button";
import { RefreshCw, Database, Filter } from "lucide-react";
import { formatBanklogTime } from "@/lib/banklogs-formatter";

type BankLogItem = {
  at: string; // ISO
  type: number; // 1/2...
  money: number; // int
  steamId: string; // string
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
  meta?: any;
  cursor?: string | null;
};

/**
 * Alias for backward compatibility
 * New code should use formatBanklogTime from @/lib/banklogs-formatter
 */
const formatBrussels = formatBanklogTime;

function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-BE").format(n);
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
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold ${
        isDeposit 
          ? "border-green-500/20 bg-green-500/10 text-green-400" 
          : "border-red-500/20 bg-red-500/10 text-red-400"
      }`}
      title={label}
    >
      <span
        className={`w-2 h-2 rounded-full ${isDeposit ? "bg-green-500" : "bg-red-500"}`}
      />
      {label}
    </span>
  );
}

export default function StaffBankLogsPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [familyId] = useState("esperados");
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const [filterType, setFilterType] = useState<string>(""); // "" = tous
  const [filterSteamId, setFilterSteamId] = useState("");

  // ✅ nouveau : période
  const [days, setDays] = useState<number>(0); // 0 = tout

  const [data, setData] = useState<BankLogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string>("");

  // charge l'état depuis l'URL au 1er mount
  useEffect(() => {
    if (!sp) return;
    const urlSteamId = sp.get("steamId") ?? "";
    const urlType = sp.get("type") ?? "";
    const urlDays = Number(sp.get("days") ?? 0);
    const urlLimit = Number(sp.get("limit") ?? 0);
    const urlPage = Number(sp.get("page") ?? 0);

    if (urlSteamId) setFilterSteamId(urlSteamId);
    if (urlType) setFilterType(urlType);
    if (!Number.isNaN(urlDays)) setDays(urlDays);

    if (urlLimit) setLimit(urlLimit);
    if (urlPage) setPage(urlPage);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncUrl(next?: Partial<{ page: number; limit: number; type: string; steamId: string; days: number }>) {
    const p = next?.page ?? page;
    const l = next?.limit ?? limit;
    const t = next?.type ?? filterType;
    const s = next?.steamId ?? filterSteamId;
    const d = next?.days ?? days;

    const qs = new URLSearchParams();
    qs.set("page", String(p));
    qs.set("limit", String(l));
    if (t) qs.set("type", t);
    if (s.trim()) qs.set("steamId", s.trim());
    if (d > 0) qs.set("days", String(d));

    router.replace(`/staff/banklogs?${qs.toString()}`);
  }

  const totalPages = useMemo(() => {
    const total = data?.total ?? 0;
    return Math.max(1, Math.ceil(total / limit));
  }, [data?.total, limit]);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const qs = new URLSearchParams();
      qs.set("familyId", familyId);
      qs.set("page", String(page));
      qs.set("limit", String(limit));

      if (filterType) qs.set("type", filterType);
      if (filterSteamId.trim()) qs.set("steamId", filterSteamId.trim());
      if (days > 0) qs.set("days", String(days));
      qs.set("t", String(Date.now()));

      const res = await fetch(`/api/banklogs?${qs.toString()}`, { cache: "no-store" });
      const txt = await res.text();

      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      const json = JSON.parse(txt) as BankLogsResponse;
      if (!json?.ok) throw new Error("Réponse API invalide");

      setData(json);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadSyncState() {
    try {
      const res = await fetch(`/api/staff/sync-state?key=banklogs:${familyId}&t=${Date.now()}`, { cache: "no-store" });
      const txt = await res.text();
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      const j = JSON.parse(txt) as SyncStateResponse;
      setLastSync(j?.syncedAt ?? null);
    } catch {
      setLastSync(null);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setError("");

    try {
      const res = await fetch("/api/staff/sync/banklogs", { method: "POST" });
      const txt = await res.text();
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

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
  }, [page, limit, filterType, filterSteamId, days]);

  // ✅ AUTO-REFRESH: Refetch all 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      load().catch(() => {
        // Silent error on auto-refresh
      });
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadSyncState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  const visibleItems = useMemo(() => data?.items ?? [], [data?.items]);

  return (
    <PageShell
      title="Banklogs"
      description={`Famille: ${familyId} • Total: ${data?.total ?? "—"} • Dernier sync: ${lastSync ? formatBrussels(lastSync) : "—"}${days > 0 ? ` • Période: ${days}j` : ""}`}
      actions={
        <div className="flex gap-2">
          <Button
            onClick={syncNow}
            disabled={syncing || loading}
            variant="outline"
            size="sm"
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
      <SectionCard title="Filtres" icon={Filter}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Type</label>
            <select
              value={filterType}
              onChange={(e) => {
                const v = e.target.value;
                setPage(1);
                setFilterType(v);
                syncUrl({ page: 1, type: v });
              }}
              className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Tous</option>
              <option value="1">Retrait</option>
              <option value="2">Dépôt</option>
            </select>
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
              className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Par page</label>
            <select
              value={String(limit)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPage(1);
                setLimit(v);
                syncUrl({ page: 1, limit: v });
              }}
              className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>
        </div>

        {/* Période */}
        <div className="flex gap-2 items-center flex-wrap mt-4">
          <span className="text-sm text-muted-foreground mr-2">Période :</span>
          <Button
            onClick={() => {
              setPage(1);
              setDays(7);
              syncUrl({ page: 1, days: 7 });
            }}
            variant={days === 7 ? "default" : "outline"}
            size="sm"
          >
            7j
          </Button>
          <Button
            onClick={() => {
              setPage(1);
              setDays(30);
              syncUrl({ page: 1, days: 30 });
            }}
            variant={days === 30 ? "default" : "outline"}
            size="sm"
          >
            30j
          </Button>
          <Button
            onClick={() => {
              setPage(1);
              setDays(90);
              syncUrl({ page: 1, days: 90 });
            }}
            variant={days === 90 ? "default" : "outline"}
            size="sm"
          >
            90j
          </Button>
          <Button
            onClick={() => {
              setPage(1);
              setDays(0);
              syncUrl({ page: 1, days: 0 });
            }}
            variant={days === 0 ? "default" : "outline"}
            size="sm"
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
      <SectionCard>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Type</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">Montant</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">SteamID</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <SkeletonTable rows={5} cols={4} />
                  </td>
                </tr>
              ) : visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <EmptyState
                      title="Aucun résultat"
                      description="Aucune transaction trouvée avec ces filtres"
                      icon={<Database className="w-16 h-16" />}
                    />
                  </td>
                </tr>
              ) : (
                visibleItems.map((it, idx) => {
                  const m = signedMoney(it.type, it.money);
                  const isWithdraw = m < 0;
                  const prefix = isWithdraw ? "-" : "+";

                  return (
                    <tr key={`${it.at}-${it.steamId}-${it.type}-${it.money}-${idx}`} className="border-b border-slate-800 hover:bg-slate-900/20">
                      <td className="px-4 py-3 text-sm">{formatBrussels(it.at)}</td>
                      <td className="px-4 py-3">
                        <TypeBadge type={it.type} />
                      </td>
                      <td className={`px-4 py-3 text-right font-bold text-sm ${isWithdraw ? "text-red-400" : "text-green-400"}`}>
                        {prefix}
                        {fmtMoney(Math.abs(m))}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{it.steamId}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center px-4 py-3 border-t border-slate-800">
          <div className="text-sm text-muted-foreground">
            Page <span className="font-bold">{page}</span> / <span className="font-bold">{totalPages}</span>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => {
                setPage(1);
                syncUrl({ page: 1 });
              }}
              disabled={page <= 1 || loading || syncing}
              variant="outline"
              size="sm"
            >
              {"<<"}
            </Button>
            <Button
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                syncUrl({ page: Math.max(1, page - 1) });
              }}
              disabled={page <= 1 || loading || syncing}
              variant="outline"
              size="sm"
            >
              {"<"}
            </Button>
            <Button
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1));
                syncUrl({ page: Math.min(totalPages, page + 1) });
              }}
              disabled={page >= totalPages || loading || syncing}
              variant="outline"
              size="sm"
            >
              {">"}
            </Button>
            <Button
              onClick={() => {
                setPage(totalPages);
                syncUrl({ page: totalPages });
              }}
              disabled={page >= totalPages || loading || syncing}
              variant="outline"
              size="sm"
            >
              {">>"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <div className="text-xs text-muted-foreground">
        Type 1 = <span className="font-bold">Retrait</span> • Type 2 = <span className="font-bold">Dépôt</span>
      </div>
    </PageShell>
  );
}
