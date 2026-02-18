"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge-new";
import { SectionCard, EmptyState } from "@/components/staff/ui";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, RefreshCw, Bell, CheckCircle2, DollarSign, User } from "lucide-react";

type DebtRow = {
  memberId: string | null;
  steamId: string;
  discordId: string | null;
  rpName: string | null;
  deficitAmount: number;
  lastAt: string | null;
};

type Config = {
  bankAlertsChannelId: string | null;
  bankDebtPingThreshold: number | null;
  bankDebtPingEnabled: boolean;
  bankDebtPingCooldownMinutes: number;
};

type DebtResponse = {
  ok: boolean;
  data: DebtRow[];
  config: Config;
};

function fmtMoney(value: number) {
  return new Intl.NumberFormat("fr-BE").format(Math.round(value));
}

function fmtDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-BE", { 
    day: "2-digit", 
    month: "2-digit", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function DebtsClient() {
  const [items, setItems] = useState<DebtRow[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [threshold, setThreshold] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchPinging, setBatchPinging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bank/debtors?limit=50&t=${Date.now()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as DebtResponse;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Échec du chargement");
      setItems(json.data ?? []);
      setConfig(json.config);
      if (threshold === "" && json.config?.bankDebtPingThreshold) {
        setThreshold(String(json.config.bankDebtPingThreshold));
      }
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function pingMember(memberId: string) {
    setBusyId(memberId);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/bank/debt-ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec du ping");
      setMessage(json.alreadyQueued ? "Ping déjà en file d'attente" : "Ping envoyé avec succès");
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusyId(null);
    }
  }

  async function pingBatch() {
    setMessage(null);
    setError(null);

    const thresholdValue = Number(threshold);
    if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
      setError("Le seuil doit être un nombre positif");
      return;
    }

    if (!confirm(`Envoyer un rappel à tous les membres avec une dette >= ${fmtMoney(thresholdValue)}$ ?`)) return;

    setBatchPinging(true);
    try {
      const res = await fetch("/api/admin/bank/debt-ping-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: thresholdValue }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec du ping groupé");
      setMessage(json.alreadyQueued ? "Batch déjà en file d'attente" : "Batch envoyé avec succès");
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBatchPinging(false);
    }
  }

  const enabled = Boolean(config?.bankDebtPingEnabled);
  const hasChannel = Boolean(config?.bankAlertsChannelId);
  const canPing = enabled && hasChannel;

  let statusReason = "";
  if (!enabled) statusReason = "Système désactivé";
  else if (!hasChannel) statusReason = "Canal manquant";

  return (
    <SectionCard
      title="Rappels de Dettes"
      icon={Bell}
    >
      <div className="space-y-6">
        {/* Status Card */}
        <Card className="p-4 bg-slate-900/60 border-slate-800">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">État du système</span>
                <Badge variant={canPing ? "default" : "outline"}>
                  {canPing ? "Activé" : "Désactivé"}
                </Badge>
              </div>
              {statusReason && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3" />
                  {statusReason}
                </p>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Cooldown: {config?.bankDebtPingCooldownMinutes || 60} min</span>
                {config?.bankDebtPingThreshold && (
                  <span>Seuil: {fmtMoney(config.bankDebtPingThreshold)}$</span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
            </div>
          </div>
        </Card>

        {/* Batch Actions */}
        <Card className="p-4 bg-slate-900/40 border-slate-800">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                type="number"
                placeholder="Seuil minimum (ex: 50000)"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <Button
              onClick={pingBatch}
              disabled={!canPing || batchPinging}
              variant="default"
            >
              {batchPinging ? (
                <>Envoi en cours...</>
              ) : (
                <>
                  <Bell className="h-4 w-4 mr-2" />
                  Ping tous &gt; seuil
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Envoyer un rappel Discord à tous les membres dépassant le seuil spécifié
          </p>
        </Card>

        {/* Messages */}
        {message && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5" />
            <div>{message}</div>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <Separator className="bg-slate-800" />

        {/* Debtors Table */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Chargement des débiteurs...
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<DollarSign className="h-12 w-12" />}
            title="Aucun débiteur détecté"
            description="Tous les membres sont à jour avec leurs comptes bancaires"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Membre</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Discord</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Dette</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Dernière tx</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr 
                    key={`${it.memberId ?? "unknown"}-${it.steamId}`}
                    className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {it.rpName || it.steamId}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {it.steamId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <code className="text-xs bg-slate-800 px-2 py-1 rounded font-mono">
                        {it.discordId || "-"}
                      </code>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-bold text-red-400">
                        {fmtMoney(it.deficitAmount)}$
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(it.lastAt)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {it.memberId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => pingMember(it.memberId as string)}
                          disabled={!canPing || busyId === it.memberId}
                        >
                          {busyId === it.memberId ? (
                            <>Envoi...</>
                          ) : (
                            <>
                              <Bell className="h-3 w-3 mr-1.5" />
                              Ping
                            </>
                          )}
                        </Button>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Non lié
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}