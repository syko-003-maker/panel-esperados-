"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionCard, EmptyState, SkeletonTable } from "@/components/staff/ui";
import { Button } from "@/components/ui/button";
import { AlertCircle, FileText, Users, RefreshCw } from "lucide-react";

type Sanction = {
  id: string;
  memberId: string | null;
  memberDiscordId: string | null;
  memberName: string;
  type: "AVERT_ORAL_PLAYTIME" | "AVERT_ORAL_REUNION" | "AVERT_LEGER" | "AVERT_LOURD" | "DEMOTE" | "RESERVISTE" | "BLACKLIST";
  source: "MANUAL" | "ACTIVITY" | "MEETING" | "SYSTEM";
  reason: string | null;
  status: "ACTIVE" | "EXPIRED" | "CLOSED";
  discordStatus: "PENDING" | "APPLIED" | "FAILED";
  discordError: string | null;
  startAt: string;
  endAt: string | null;
  expiresAt: string | null;
  clearedAt: string | null;
  clearedStatus: string | null;
  clearedError: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  justificationsCount: number;
};

type MemberOption = {
  id: string;
  rpName: string;
  discordId: string | null;
};

type Justification = {
  id: string;
  authorDiscordId: string;
  message: string;
  status: string;
  createdAt: string;
};

const STATUSES: Sanction["status"][] = ["ACTIVE", "EXPIRED", "CLOSED"];
const TYPES: Sanction["type"][] = [
  "AVERT_ORAL_PLAYTIME",
  "AVERT_ORAL_REUNION",
  "AVERT_LEGER",
  "AVERT_LOURD",
  "DEMOTE",
  "RESERVISTE",
  "BLACKLIST",
];

const STATUS_TONE: Record<Sanction["status"], string> = {
  ACTIVE: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  EXPIRED: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
  CLOSED: "bg-green-500/20 text-green-300 border-green-500/30",
};

const DISCORD_TONE: Record<Sanction["discordStatus"], string> = {
  PENDING: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  APPLIED: "bg-green-500/20 text-green-300 border-green-500/30",
  FAILED: "bg-red-500/20 text-red-300 border-red-500/30",
};

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function SanctionsClient() {
  const router = useRouter();
  const [items, setItems] = useState<Sanction[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    memberId: "",
    type: "AVERT_ORAL_PLAYTIME" as Sanction["type"],
    reason: "",
  });

  async function loadMembers() {
    try {
      const res = await fetch("/api/staff/sanctions/members?familyId=esperados", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load members");
      setMembers(json.items ?? []);
    } catch (err: any) {
      setMembers([]);
      setError(String(err?.message ?? err));
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("familyId", "esperados");
      if (statusFilter) qs.set("status", statusFilter);
      const res = await fetch(`/api/staff/sanctions?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load");
      setItems(data.data ?? []);
    } catch (err: any) {
      setItems([]);
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  useEffect(() => {
    loadMembers();
  }, []);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === createForm.memberId) ?? null,
    [members, createForm.memberId]
  );
  const missingDiscordId = Boolean(createForm.memberId && !selectedMember?.discordId);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (missingDiscordId) {
      setError("Ce membre n'a pas de Discord ID");
      return;
    }
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      familyId: "esperados",
      memberId: createForm.memberId,
      type: createForm.type,
      reason: createForm.reason,
    };
    if (selectedMember?.discordId) {
      payload.memberDiscordId = selectedMember.discordId;
    }

    try {
      const res = await fetch("/api/staff/sanctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Create failed");
      setCreateForm({
        memberId: "",
        type: "AVERT_ORAL_PLAYTIME",
        reason: "",
      });
      await load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }

  async function closeSanction(item: Sanction) {
    try {
      const res = await fetch(`/api/staff/sanctions/${item.id}/close`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Close failed");
      await load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/staff/sync/all", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Sync failed");
      router.refresh();
      await load();
    } catch (err: any) {
      setSyncError(String(err?.message ?? err));
    } finally {
      setSyncing(false);
    }
  }

  if (members.length === 0 && !loading) {
    return (
      <EmptyState
        icon={<Users />}
        title="Aucun membre trouvé"
        description="Importez ou liez des membres pour créer des sanctions"
        actionLabel="Aller aux membres"
        onAction={() => (window.location.href = "/staff/members")}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Sanctions</h2>
          <p className="text-sm text-muted-foreground">Gestion des sanctions</p>
        </div>
        <Button onClick={syncNow} disabled={syncing} variant="outline" size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Synchronisation..." : "Synchroniser"}
        </Button>
      </div>

      {syncError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
          {syncError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">{/* Left: Create Form */}
      <SectionCard title="Créer une sanction">
        <form onSubmit={onCreate} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Membre</label>
            <select
              value={createForm.memberId}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, memberId: e.target.value }))}
              required
              className="w-full bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Sélectionner...</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.rpName}
                </option>
              ))}
            </select>
            {missingDiscordId && (
              <p className="text-xs text-red-400">Ce membre n&apos;a pas de Discord ID</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Type</label>
            <select
              value={createForm.type}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, type: e.target.value as Sanction["type"] }))
              }
              className="w-full bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Raison</label>
            <textarea
              value={createForm.reason}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, reason: e.target.value }))}
              rows={3}
              className="w-full bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <Button type="submit" disabled={saving || missingDiscordId} className="w-full">
            {saving ? "Création..." : "Créer la sanction"}
          </Button>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </form>
      </SectionCard>

      {/* Right: Filters + List */}
      <div className="space-y-6">
        <SectionCard title="Filtres">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Tous</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </SectionCard>

        <SectionCard title={`Sanctions (${items.length})`}>
          {loading ? (
            <SkeletonTable rows={5} cols={4} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title="Aucune sanction"
              description="Aucune sanction ne correspond aux filtres sélectionnés"
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-slate-900/20 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <Link
                        href={`/staff/sanctions/${item.id}`}
                        className="font-medium text-foreground hover:text-purple-400 transition-colors"
                      >
                        {item.memberName}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs border ${STATUS_TONE[item.status]}`}>
                        {item.status}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs border ${DISCORD_TONE[item.discordStatus]}`}>
                        {item.discordStatus}
                      </span>
                    </div>
                  </div>
                  
                  {item.reason && (
                    <p className="text-sm text-slate-400 mb-2">{item.reason}</p>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{fmtDate(item.startAt)}</span>
                    {item.status === "ACTIVE" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => closeSanction(item)}
                      >
                        Clôturer
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
    </div>
  );
}
