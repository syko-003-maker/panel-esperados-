"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { LoadingState } from "@/components/staff/ui/LoadingState";
import { MotionButtonFrame, MotionListItem } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { AlertCircle, RefreshCw, Bell, CheckCircle2, DollarSign } from "lucide-react";
import { useDiscordAvatars } from "@/lib/hooks/useDiscordAvatars";
import { GRADE_LABEL_BY_ROLE_ID, GRADE_BADGE_STYLE_BY_ROLE_ID } from "@/lib/grade-colors";

type DebtRow = {
  memberId: string | null;
  steamId: string;
  discordId: string | null;
  rpName: string | null;
  grade: string | null;
  gradeLevel: number;
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
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

// fmtDate centralisé (date seule) via @/lib/app-date-formatter
// (l'ancienne impl utilisait toLocaleDateString qui ignore hour/minute → date seule de facto)
import { formatAppDateOnly as fmtDate } from "@/lib/app-date-formatter";

function MemberAvatar({ url, name }: { url?: string | null; name?: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = (name ?? "?").trim().charAt(0).toUpperCase();
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name ?? ""}
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-xl object-cover border border-white/10"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-slate-300">
      {initials}
    </div>
  );
}

export default function DebtsClient() {
  const [items, setItems] = useState<DebtRow[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [threshold, setThreshold] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchPinging, setBatchPinging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const avatars = useDiscordAvatars(items.map((i) => i.discordId));

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bank/debtors?limit=50&t=${Date.now()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as DebtResponse;
      if (!res.ok || !json?.ok) throw new Error((json as { error?: string }).error || "Échec du chargement");
      setItems(json.data ?? []);
      setConfig(json.config);
      if (threshold === "" && json.config?.bankDebtPingThreshold) {
        setThreshold(String(json.config.bankDebtPingThreshold));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setTimeout(() => setError(null), 5000);
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

    if (!confirm(`Envoyer un rappel à tous les membres avec une dette >= ${fmtMoney(thresholdValue)} ?`)) return;

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setTimeout(() => setError(null), 5000);
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
    <SectionCard title="Rappels de dettes" description="Gestion des rappels Discord pour les membres en déficit." icon={Bell}>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">État du système</span>
                <StatusBadge tone={canPing ? "success" : "warning"}>{canPing ? "Activé" : "Désactivé"}</StatusBadge>
              </div>
              {statusReason ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3" />
                  {statusReason}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span>Cooldown: {config?.bankDebtPingCooldownMinutes || 60} min</span>
                {config?.bankDebtPingThreshold ? <span>Seuil: {fmtMoney(config.bankDebtPingThreshold)}</span> : null}
              </div>
            </div>

            <MotionButtonFrame>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
            </MotionButtonFrame>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              placeholder="Seuil minimum (ex: 50000)"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              className="h-10 min-w-[220px] flex-1 rounded-xl border border-white/10 bg-card/70 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
            />

            <MotionButtonFrame>
              <Button onClick={pingBatch} disabled={!canPing || batchPinging}>
                {batchPinging ? (
                  "Envoi en cours..."
                ) : (
                  <>
                    <Bell className="mr-2 h-4 w-4" />
                    Ping tous {">"} seuil
                  </>
                )}
              </Button>
            </MotionButtonFrame>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Envoyer un rappel Discord à tous les membres dépassant le seuil spécifié.</p>
        </div>

        {message ? (
          <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            <div>{message}</div>
          </div>
        ) : null}
        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div>{error}</div>
          </div>
        ) : null}

        {loading ? (
          <LoadingState title="Chargement des débiteurs" description="Récupération de l'état courant des dettes membres." />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<DollarSign className="h-12 w-12" />}
            title="Aucun débiteur détecté"
            description="Tous les membres sont à jour avec leurs comptes bancaires."
          />
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => (
              <MotionListItem
                key={`${item.memberId ?? "unknown"}-${item.steamId}`}
                delay={index * 0.015}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <MemberAvatar
                      url={item.discordId ? avatars.get(item.discordId) : null}
                      name={item.rpName}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{item.rpName || item.steamId}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.grade && GRADE_LABEL_BY_ROLE_ID[item.grade] ? (
                          <span className={GRADE_BADGE_STYLE_BY_ROLE_ID[item.grade] ?? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-zinc-500/10 border-zinc-400/20 text-zinc-200"}>
                            {GRADE_LABEL_BY_ROLE_ID[item.grade]}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-zinc-500/10 border-zinc-400/20 text-zinc-200">
                            Sans grade
                          </span>
                        )}
                        <span className="truncate font-mono text-xs text-muted-foreground">{item.steamId}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                    <StatusBadge tone={item.discordId ? "info" : "warning"}>{item.discordId || "Non lié"}</StatusBadge>
                    <StatusBadge tone="danger">{fmtMoney(item.deficitAmount)}</StatusBadge>
                    <span className="text-xs text-muted-foreground">Dernière tx: {fmtDate(item.lastAt)}</span>
                    {item.memberId ? (
                      <MotionButtonFrame>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => pingMember(item.memberId as string)}
                          disabled={!canPing || busyId === item.memberId}
                        >
                          {busyId === item.memberId ? "Envoi..." : <><Bell className="mr-1.5 h-3 w-3" />Ping</>}
                        </Button>
                      </MotionButtonFrame>
                    ) : null}
                  </div>
                </div>
              </MotionListItem>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
