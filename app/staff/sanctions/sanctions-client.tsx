"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { SkeletonTable } from "@/components/staff/ui/Skeletons";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Check, ChevronsUpDown, FileText, RefreshCw, Search, Users } from "lucide-react";
import {
  canClearSanction,
  canDeleteSanction,
  getSanctionLabel,
  SANCTION_DELETE_BLOCKING_OUTBOX_STATUSES,
} from "@/lib/sanctions";
import { getEffectiveSanctionStatus, getSanctionStatusLabel } from "@/lib/sanction-status-labels";

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
  outboxStatus: string | null;
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

const SANCTION_TYPE_OPTIONS = TYPES.map((value) => ({
  value,
  label: getSanctionLabel(value),
}));

const STATUS_TONE: Record<Sanction["status"], string> = {
  ACTIVE: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  EXPIRED: "bg-white/5 text-muted-foreground border border-white/10",
  CLOSED: "bg-green-500/20 text-green-300 border-green-500/30",
};

const DISCORD_TONE: Record<Sanction["discordStatus"], string> = {
  PENDING: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  APPLIED: "bg-green-500/20 text-green-300 border-green-500/30",
  FAILED: "bg-red-500/20 text-red-300 border-red-500/30",
};

const STATUS_BADGE_TONES: Record<Sanction["status"], "warning" | "neutral" | "success"> = {
  ACTIVE: "warning",
  EXPIRED: "neutral",
  CLOSED: "success",
};

const DISCORD_BADGE_TONES: Record<Sanction["discordStatus"], "warning" | "success" | "danger"> = {
  PENDING: "warning",
  APPLIED: "success",
  FAILED: "danger",
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [createForm, setCreateForm] = useState({
    memberId: "",
    type: "AVERT_ORAL_PLAYTIME" as Sanction["type"],
    reason: "",
  });
  const deferredMemberSearch = useDeferredValue(memberSearch);

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
  const filteredMembers = useMemo(() => {
    const query = deferredMemberSearch.trim().toLowerCase();
    if (!query) return members;

    return members.filter((member) => {
      const rpName = member.rpName.toLowerCase();
      const discordId = member.discordId?.toLowerCase() ?? "";
      return rpName.includes(query) || discordId.includes(query);
    });
  }, [members, deferredMemberSearch]);
  const missingDiscordId = Boolean(createForm.memberId && !selectedMember?.discordId);

  function selectMember(memberId: string) {
    setCreateForm((prev) => ({ ...prev, memberId }));
    setMemberPickerOpen(false);
    setMemberSearch("");
  }

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
    };
    const trimmedReason = createForm.reason.trim();
    if (trimmedReason) {
      payload.reason = trimmedReason;
    }
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
      setMemberSearch("");
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

  async function deleteSanction(item: Sanction) {
    if (!confirm("Supprimer cette sanction ? Cette action est irréversible.")) return;

    setDeletingId(item.id);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/${item.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        if (json?.error === "SANCTION_DELETE_BLOCKED_ALREADY_APPLIED") {
          throw new Error(
            "Une sanction déjà appliquée ne peut pas être supprimée. Utilisez plutôt Supprimer ou Clôturer."
          );
        }

        if (json?.error === "SANCTION_DELETE_BLOCKED_OUTBOX_ALREADY_SENT_OR_RUNNING") {
          throw new Error(
            "Impossible de supprimer cette sanction car son traitement Discord est déjà en cours ou terminé. Utilisez plutôt Clôturer ou Supprimer."
          );
        }

        if (res.status === 409 && typeof json?.details?.message === "string") {
          throw new Error(json.details.message);
        }

        throw new Error(json?.error || "Delete failed");
      }

      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setDeletingId(null);
    }
  }

  async function clearSanction(item: Sanction) {
    const isReserviste = item.type === "RESERVISTE";
    const confirmMessage = isReserviste
      ? "Retirer l'état Réserviste ? Cette action retirera le rôle Réserviste sur Discord."
      : "Supprimer la sanction appliquée ? Cette action retirera son effet Discord.";
    if (!confirm(confirmMessage)) return;

    setClearingId(item.id);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/${item.id}/clear`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Suppression failed");
      await load();
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setClearingId(null);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/staff/sync/members", { method: "POST" });
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
      <div className="flex justify-end">
        <MotionButtonFrame>
        <Button onClick={syncNow} disabled={syncing} variant="outline" size="sm" className="rounded-2xl border-white/10 bg-white/[0.04]">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Synchronisation..." : "Synchroniser"}
        </Button>
        </MotionButtonFrame>
      </div>

      {syncError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
          {syncError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px),minmax(0,1fr)]">{/* Left: Create Form */}
      <SectionCard
        title="Créer une sanction"
        description="Attribuer rapidement une sanction avec des libellés métier clairs et un formulaire plus lisible."
        className="border-white/8 bg-[linear-gradient(180deg,rgba(18,5,8,0.92),rgba(14,4,6,0.72))] shadow-[0_18px_60px_-28px_rgba(0,0,0,0.75)]"
      >
        <form onSubmit={onCreate} className="space-y-5">
          <div className="rounded-2xl border border-white/8 bg-card/40 p-5 shadow-inner shadow-black/10">
            <div className="space-y-5">
              <div className="space-y-2.5">
                <label className="text-sm font-semibold text-foreground">Membre</label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMemberPickerOpen(true)}
                  className="h-12 w-full justify-between rounded-xl border-white/10 bg-card/70 px-4 text-left text-foreground shadow-sm transition-colors hover:border-white/20 hover:bg-card/90 focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-0"
                  aria-label="Sélectionner un membre"
                >
                  <span className={selectedMember ? "truncate text-sm text-foreground" : "truncate text-sm text-muted-foreground"}>
                    {selectedMember?.rpName ?? "Rechercher et sélectionner un membre"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Button>
                <p className="text-xs text-muted-foreground">Seuls les membres actifs et lies sont proposes ici.</p>
                {missingDiscordId && (
                  <p className="text-xs text-red-400">Ce membre n&apos;a pas de Discord ID</p>
                )}
              </div>

              <div className="space-y-2.5">
                <label className="text-sm font-semibold text-foreground">Type</label>
                <Select
                  value={createForm.type}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, type: value as Sanction["type"] }))
                  }
                >
                  <SelectTrigger
                    className="h-12 rounded-xl border-white/10 bg-card/70 px-4 text-left text-foreground shadow-sm transition-colors hover:border-white/20 focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-0"
                    aria-label="Sélectionner un type de sanction"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/8 bg-card text-foreground shadow-2xl">
                    {SANCTION_TYPE_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="rounded-md py-2.5 text-sm text-foreground focus:bg-white/8 focus:text-foreground"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">L&apos;interface n&apos;affiche que des libellés métier propres.</p>
              </div>

              <div className="space-y-2.5">
                <label className="text-sm font-semibold text-foreground">Raison (optionnelle)</label>
                <Textarea
                  value={createForm.reason}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, reason: e.target.value }))}
                  rows={4}
                  placeholder="Préciser le contexte de la sanction si nécessaire"
                  className="min-h-[112px] rounded-xl border-white/10 bg-card/70 px-4 py-3 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-amber-500/50"
                />
                <p className="text-xs text-muted-foreground">Vous pouvez laisser ce champ vide sans bloquer la création.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              disabled={saving || missingDiscordId || !createForm.memberId}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-[#7a1f2b] via-[#9a2535] to-amber-700 text-sm font-semibold text-white shadow-[0_14px_30px_-14px_rgba(122,31,43,0.8)] transition-transform hover:translate-y-[-1px] hover:from-[#8a2535] hover:via-[#aa2d40] hover:to-amber-600"
            >
              {saving ? "Création..." : "Créer la sanction"}
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </form>

        <Dialog open={memberPickerOpen} onOpenChange={setMemberPickerOpen}>
          <DialogContent className="border-white/8 bg-card p-0 text-foreground shadow-[0_32px_80px_-32px_rgba(0,0,0,0.9)] sm:max-w-xl">
            <DialogHeader className="border-b border-white/8 px-6 py-5">
              <DialogTitle className="text-foreground">Choisir un membre</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Tapez quelques lettres pour filtrer la liste, puis cliquez sur le membre à sélectionner.
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 py-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Rechercher par nom RP ou Discord ID"
                  className="h-11 rounded-xl border-white/10 bg-card/70 pl-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-amber-500/50"
                />
              </div>

              <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-white/8 bg-card/60 p-2">
                {filteredMembers.length > 0 ? (
                  <div className="space-y-1">
                    {filteredMembers.map((member) => {
                      const isSelected = member.id === createForm.memberId;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => selectMember(member.id)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                            isSelected
                              ? "bg-[#7a1f2b]/20 text-rose-100"
                              : "text-foreground/80 hover:bg-white/8 hover:text-foreground"
                          }`}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium">{member.rpName}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {member.discordId ?? "Discord ID indisponible"}
                            </span>
                          </span>
                          {isSelected ? <Check className="ml-3 h-4 w-4 shrink-0 text-amber-400" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
                    Aucun membre ne correspond à cette recherche.
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </SectionCard>

      {/* Right: Filters + List */}
      <div className="space-y-6">
        <SectionCard title="Filtres" description="Affinage rapide des sanctions visibles par statut métier.">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/70">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-card/70 px-3 py-2 text-sm text-foreground focus:border-amber-500/40 focus:outline-none"
            >
              <option value="">Tous</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {getSanctionStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </SectionCard>

        <SectionCard
          title={`Sanctions (${items.length})`}
          description="Liste consolidée avec actions métier disponibles selon l'état effectif de chaque sanction."
          actions={<StatusBadge>{items.length} visible{items.length > 1 ? "s" : ""}</StatusBadge>}
        >
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
              {items.map((item) => {
                const effectiveStatus = getEffectiveSanctionStatus(
                  item.status,
                  item.clearedAt,
                  item.clearedStatus
                ) as Sanction["status"];
                const canDeleteItem = canDeleteSanction(item);
                const canClearItem = canClearSanction(item);
                const clearActionLabel = item.type === "RESERVISTE" ? "Retirer réserviste" : "Supprimer";
                const deleteBlockedByOutbox =
                  !canDeleteItem &&
                  item.discordStatus !== "APPLIED" &&
                  Boolean(item.outboxStatus) &&
                  SANCTION_DELETE_BLOCKING_OUTBOX_STATUSES.includes(item.outboxStatus as any);
                return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.05]"
                >
                  <div className="flex flex-col gap-2 mb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <Link
                        href={`/staff/sanctions/${item.id}`}
                        className="font-medium text-foreground transition-colors hover:text-amber-300"
                      >
                        {item.memberName}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-1">
                        {getSanctionLabel(item.type)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={STATUS_BADGE_TONES[effectiveStatus]} className={STATUS_TONE[effectiveStatus]}>
                        {getSanctionStatusLabel(effectiveStatus)}
                      </StatusBadge>
                      <StatusBadge tone={DISCORD_BADGE_TONES[item.discordStatus]} className={DISCORD_TONE[item.discordStatus]}>
                        {getSanctionStatusLabel(item.discordStatus)}
                      </StatusBadge>
                      {item.clearedStatus === "PENDING" ? (
                        <StatusBadge tone="info" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                          {getSanctionStatusLabel("CLEAR_PENDING")}
                        </StatusBadge>
                      ) : null}
                      {item.clearedStatus === "APPLIED" ? (
                        <StatusBadge tone="success" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                          {getSanctionStatusLabel("CLEAR_APPLIED")}
                        </StatusBadge>
                      ) : null}
                    </div>
                  </div>
                  
                  {item.reason && (
                    <p className="text-sm text-muted-foreground mb-2">{item.reason}</p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{fmtDate(item.startAt)}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {canDeleteItem ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-xl"
                          onClick={() => deleteSanction(item)}
                          disabled={deletingId === item.id || clearingId === item.id}
                        >
                          {deletingId === item.id ? "Suppression..." : "Supprimer"}
                        </Button>
                      ) : null}
                      {canClearItem ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="rounded-xl border border-white/10 bg-white/[0.06] text-foreground hover:bg-white/[0.12]"
                          onClick={() => clearSanction(item)}
                          disabled={clearingId === item.id || deletingId === item.id}
                        >
                          {clearingId === item.id ? "Suppression..." : clearActionLabel}
                        </Button>
                      ) : null}
                      {effectiveStatus === "ACTIVE" && item.discordStatus !== "APPLIED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl border-white/10 bg-white/[0.04]"
                          onClick={() => closeSanction(item)}
                          disabled={deletingId === item.id || clearingId === item.id}
                        >
                          Clôturer
                        </Button>
                      )}
                    </div>
                  </div>
                  {deleteBlockedByOutbox ? (
                    <p className="mt-2 text-xs text-amber-300">
                      Suppression indisponible: le job Discord est déjà en cours ou terminé ({item.outboxStatus}).
                    </p>
                  ) : null}
                </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
    </div>
  );
}
