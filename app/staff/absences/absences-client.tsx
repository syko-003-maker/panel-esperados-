"use client";

import { useEffect, useState } from "react";
import { PageShell, SectionCard, EmptyState, SkeletonTable } from "@/components/staff/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw } from "lucide-react";
import Link from "next/link";

type Absence = {
  id: string;
  familyId: string;
  discordId: string;
  reason: string | null;
  notes: string | null;
  startAt: string;
  endAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
  createdAt: string;
  updatedAt: string;
};

const STATUSES: Absence["status"][] = ["PENDING", "APPROVED", "REJECTED", "CANCELED"];

const STATUS_COLORS: Record<Absence["status"], string> = {
  PENDING: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  APPROVED: "bg-green-500/20 text-green-300 border border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-300 border border-red-500/30",
  CANCELED: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AbsencesClient() {
  const [items, setItems] = useState<Absence[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    discordId: "",
    startAt: "",
    endAt: "",
    reason: "",
    notes: "",
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("familyId", "esperados");
      if (statusFilter) qs.set("status", statusFilter);
      const res = await fetch(`/api/staff/absences?${qs.toString()}`, { cache: "no-store" });
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

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/sync/absences", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Sync failed");
      await load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    try {
      const payload = {
        familyId: "esperados",
        discordId: formData.discordId.trim(),
        startAt: new Date(formData.startAt).toISOString(),
        endAt: new Date(formData.endAt).toISOString(),
        reason: formData.reason.trim() || null,
        notes: formData.notes.trim() || null,
      };

      if (!payload.discordId) throw new Error("Discord ID requis");
      if (!payload.startAt || payload.startAt === "Invalid Date") throw new Error("Date de début invalide");
      if (!payload.endAt || payload.endAt === "Invalid Date") throw new Error("Date de fin invalide");

      const res = await fetch("/api/staff/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Create failed");

      // Reset form
      setFormData({ discordId: "", startAt: "", endAt: "", reason: "", notes: "" });
      await load();
    } catch (err: any) {
      setFormError(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: Absence["status"]) {
    try {
      const res = await fetch(`/api/staff/absences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Update failed");
      await load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    }
  }

  function renderActions(item: Absence) {
    if (item.status === "PENDING") {
      return (
        <div className="flex gap-2">
          <button
            onClick={() => updateStatus(item.id, "APPROVED")}
            className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30"
          >
            Approuver
          </button>
          <button
            onClick={() => updateStatus(item.id, "REJECTED")}
            className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30"
          >
            Refuser
          </button>
        </div>
      );
    }
    if (item.status === "APPROVED" || item.status === "REJECTED") {
      return (
        <button
          onClick={() => updateStatus(item.id, "CANCELED")}
          className="px-2 py-1 rounded text-xs bg-slate-500/20 text-slate-300 hover:bg-slate-500/30 border border-slate-500/30"
        >
          Annuler
        </button>
      );
    }
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  return (
    <PageShell
      title="Absences"
      description="Gestion des absences membres"
      actions={
        <Button onClick={syncNow} disabled={syncing} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sync..." : "Sync maintenant"}
        </Button>
      }
    >
      <div className="grid gap-6">
        {/* Form Section */}
        <SectionCard title="Nouvelle Absence" description="Créer une nouvelle absence">
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Discord ID</label>
                <Input
                  type="text"
                  value={formData.discordId}
                  onChange={(e) => setFormData({ ...formData, discordId: e.target.value })}
                  placeholder="123456789..."
                  required
                  className="bg-slate-900/40 border-slate-800"
                />
              </div>
              <div></div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Date de Début</label>
                <Input
                  type="datetime-local"
                  value={formData.startAt}
                  onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                  required
                  className="bg-slate-900/40 border-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Date de Fin</label>
                <Input
                  type="datetime-local"
                  value={formData.endAt}
                  onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                  required
                  className="bg-slate-900/40 border-slate-800"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-2">Raison</label>
                <Input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Ex: Vacances, Maladie..."
                  className="bg-slate-900/40 border-slate-800"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notes supplémentaires..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground placeholder-gray-500 text-sm focus:outline-none focus:border-slate-600"
                />
              </div>
            </div>

            {formError && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                <span>❌</span>
                <div>{formError}</div>
              </div>
            )}

            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "Création..." : "Créer Absence"}
            </Button>
          </form>
        </SectionCard>

        {/* Filter & List Section */}
        <SectionCard title="Liste des Absences" description={`Total: ${items.length}`}>
          <div className="space-y-4">
            {/* Filter */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <label className="text-xs font-medium text-muted-foreground">Filtre par statut:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground text-sm focus:outline-none"
              >
                <option value="">Tous les statuts</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                <span>❌</span>
                <div>{error}</div>
              </div>
            )}

            {loading ? (
              <SkeletonTable rows={5} cols={7} />
            ) : items.length === 0 ? (
              <EmptyState
                title="Aucune absence"
                description="Aucune absence trouvée pour les filtres actuels"
                  icon="📅"
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/30">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Discord
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Raison
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Début
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Fin
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Statut
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Actions
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Créé
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-800/50 hover:bg-slate-900/30 transition-colors ${
                          idx % 2 === 0 ? "bg-slate-900/10" : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-foreground font-mono text-xs">{item.discordId}</td>
                        <td className="px-4 py-3 text-foreground">{item.reason || "—"}</td>
                        <td className="px-4 py-3 text-foreground text-xs">{fmtDate(item.startAt)}</td>
                        <td className="px-4 py-3 text-foreground text-xs">{fmtDate(item.endAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[item.status]}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{renderActions(item)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
