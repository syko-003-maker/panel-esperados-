"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { SkeletonTable } from "@/components/staff/ui/Skeletons";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Sélecteur de membre ────────────────────────────────────────────────────

type MemberSuggestion = {
  id: string;
  rpName: string | null;
  discordId: string | null;
  grade: string | null;
};

function MemberPicker({
  value,
  onChange,
}: {
  value: MemberSuggestion | null;
  onChange: (m: MemberSuggestion | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<MemberSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fermer si clic extérieur
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function search(q: string) {
    if (q.trim().length < 1) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setFetching(true);
    try {
      const res = await fetch(`/api/staff/members/search?q=${encodeURIComponent(q)}&limit=12`);
      const json = await res.json();
      if (json.ok) {
        setSuggestions(json.data ?? []);
        setOpen(true);
      }
    } catch {
      // silencieux
    } finally {
      setFetching(false);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (value) onChange(null); // reset si on retape
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 220);
  }

  function select(m: MemberSuggestion) {
    onChange(m);
    setQuery(m.rpName ?? m.discordId ?? "");
    setOpen(false);
    setSuggestions([]);
  }

  function clear() {
    onChange(null);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  const displayValue = value ? (value.rpName ?? value.discordId ?? value.id) : query;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative flex items-center">
        <Input
          type="text"
          value={displayValue}
          onChange={handleInput}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          placeholder="Rechercher par nom RP ou Discord ID…"
          className={`bg-slate-900/40 border-slate-800 pr-8 ${value ? "border-emerald-500/40 bg-emerald-500/5" : ""}`}
          autoComplete="off"
        />
        {fetching && (
          <span className="absolute right-2 text-xs text-slate-500 animate-pulse">…</span>
        )}
        {value && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 text-slate-500 hover:text-slate-300 transition"
            title="Effacer la sélection"
          >
            ✕
          </button>
        )}
      </div>

      {/* Sélection confirmée */}
      {value && (
        <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/25 bg-emerald-500/8 text-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-xs font-semibold text-emerald-300 uppercase flex-shrink-0">
            {(value.rpName ?? "?").charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-emerald-200 truncate">{value.rpName ?? "—"}</p>
            {value.grade && <p className="text-[11px] text-emerald-400/70 truncate">{value.grade}</p>}
            {value.discordId && (
              <p className="text-[11px] font-mono text-slate-500 truncate">{value.discordId}</p>
            )}
          </div>
          <span className="ml-auto text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
            ✓ Sélectionné
          </span>
        </div>
      )}

      {/* Dropdown suggestions */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
          {suggestions.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={() => select(m)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-800 transition-colors"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-slate-300 uppercase">
                  {(m.rpName ?? "?").charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {m.rpName ?? <span className="italic text-slate-500">Sans nom RP</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {m.grade && <span className="text-slate-400 mr-2">{m.grade}</span>}
                    {m.discordId && <span className="font-mono">{m.discordId}</span>}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !fetching && suggestions.length === 0 && query.trim().length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-500 shadow-2xl">
          Aucun membre actif trouvé pour «&nbsp;{query}&nbsp;»
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

type AbsenceItem = {
  id: string;
  familyId: string;
  memberId: string | null;
  member: {
    id: string;
    rpName: string | null;
    discordId: string | null;
    steamId: string | null;
  } | null;
  discordId: string;
  reason: string | null;
  notes: string | null;
  type: "MEETING" | "GENERAL";
  meetingDate: string | null;
  startAt: string;
  endAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  uiStatus: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  rejectionReason: string | null;
  decidedAt: string | null;
  decidedBy: { id: string; name: string | null; rpName: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

const TYPE_COLORS: Record<AbsenceItem["type"], string> = {
  MEETING: "bg-amber-500/15 text-amber-300 border border-amber-500/25",
  GENERAL: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
};

const STATUSES: Array<AbsenceItem["uiStatus"]> = ["PENDING", "APPROVED", "REJECTED", "EXPIRED"];

const STATUS_COLORS: Record<AbsenceItem["uiStatus"], string> = {
  PENDING: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  APPROVED: "bg-green-500/20 text-green-300 border border-green-500/30",
  REJECTED: "bg-red-500/20 text-red-300 border border-red-500/30",
  EXPIRED: "bg-slate-500/20 text-slate-300 border border-slate-500/30",
};

const STATUS_LABELS: Record<AbsenceItem["uiStatus"], string> = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
  EXPIRED: "Expirée",
};

const TYPE_LABELS: Record<AbsenceItem["type"], string> = {
  MEETING: "Absence réunion",
  GENERAL: "Absence générale",
};

const TYPE_TONES: Record<AbsenceItem["type"], "info" | "accent"> = {
  MEETING: "info",
  GENERAL: "accent",
};

const STATUS_TONES: Record<AbsenceItem["uiStatus"], "warning" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
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

function fmtDateShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function AbsencesClient() {
  const [items, setItems] = useState<AbsenceItem[]>([]);
  const [filters, setFilters] = useState({ status: "", dateFrom: "", dateTo: "" });
  const [pendingFilters, setPendingFilters] = useState({ status: "", dateFrom: "", dateTo: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Inline rejection state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedMember, setSelectedMember] = useState<MemberSuggestion | null>(null);
  const [formData, setFormData] = useState({
    type: "GENERAL" as "MEETING" | "GENERAL",
    meetingDate: "",
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
      if (filters.status) qs.set("status", filters.status);
      if (filters.dateFrom) qs.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) qs.set("dateTo", filters.dateTo);
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      const res = await fetch(`/api/staff/absences?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const msg = data?.error ? `${data.error} (requestId: ${data.requestId ?? "n/a"})` : "Failed to load";
        throw new Error(msg);
      }
      setItems(data.data ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
    } catch (err: any) {
      setItems([]);
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    try {
      if (!selectedMember) throw new Error("Veuillez sélectionner un membre");
      const trimmedMemberId = selectedMember.id;
      const trimmedDiscordId = selectedMember.discordId?.trim() ?? "";

      if (formData.type === "GENERAL") {
        if (!formData.startAt) throw new Error("Date de début requise");
        if (!formData.endAt) throw new Error("Date de fin requise");
        const start = new Date(formData.startAt);
        const end = new Date(formData.endAt);
        if (end <= start) throw new Error("La date de fin doit être après la date de début");
        const limit = new Date(start);
        limit.setMonth(limit.getMonth() + 2);
        if (end > limit) throw new Error("La durée ne peut pas dépasser 2 mois");
      } else {
        if (!formData.meetingDate) throw new Error("La date de la réunion est requise");
      }

      const payload = {
        familyId: "esperados",
        memberId: trimmedMemberId || undefined,
        discordId: trimmedDiscordId || undefined,
        type: formData.type,
        meetingDate:
          formData.type === "MEETING" && formData.meetingDate
            ? new Date(formData.meetingDate).toISOString()
            : undefined,
        startAt:
          formData.type === "GENERAL"
            ? new Date(formData.startAt).toISOString()
            : new Date(formData.meetingDate).toISOString(),
        endAt:
          formData.type === "GENERAL"
            ? new Date(formData.endAt).toISOString()
            : new Date(formData.meetingDate).toISOString(),
        reason: formData.reason.trim() || null,
        notes: formData.notes.trim() || null,
      };

      const res = await fetch("/api/staff/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const msg = json?.error ? `${json.error} (requestId: ${json.requestId ?? "n/a"})` : "Create failed";
        throw new Error(msg);
      }

      setSelectedMember(null);
      setFormData({
        type: "GENERAL",
        meetingDate: "",
        startAt: "",
        endAt: "",
        reason: "",
        notes: "",
      });
      await load();
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      setFormError(msg);
      setTimeout(() => setFormError(null), 6000);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: AbsenceItem["status"], rejectionReason?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/staff/absences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectionReason: rejectionReason ?? null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const msg = json?.error ? `${json.error} (requestId: ${json.requestId ?? "n/a"})` : "Mise à jour échouée";
        throw new Error(msg);
      }
      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      setError(msg);
      setTimeout(() => setError(null), 6000);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject(id: string) {
    const reason = rejectReason.trim();
    if (!reason) {
      setError("Le motif de refus est obligatoire.");
      return;
    }
    await updateStatus(id, "REJECTED", reason);
  }

  function renderActions(item: AbsenceItem) {
    if (item.status !== "PENDING") {
      return <span className="text-xs text-muted-foreground">—</span>;
    }

    if (rejectingId === item.id) {
      const isBusy = busyId === item.id;
      return (
        <div className="flex flex-col gap-2 min-w-[180px]">
          <Input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motif du refus..."
            className="h-7 text-xs bg-slate-900/60 border-slate-700"
            autoFocus
            disabled={isBusy}
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-xs flex-1"
              onClick={() => confirmReject(item.id)}
              disabled={!rejectReason.trim() || isBusy}
            >
              {isBusy ? "…" : "Confirmer"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              disabled={isBusy}
              onClick={() => { setRejectingId(null); setRejectReason(""); }}
            >
              Annuler
            </Button>
          </div>
        </div>
      );
    }

    const isBusy = busyId === item.id;
    return (
      <div className="flex gap-2">
        <Button
          onClick={() => updateStatus(item.id, "APPROVED")}
          disabled={isBusy}
          size="sm"
          className="h-8 rounded-xl border border-emerald-500/30 bg-emerald-500/14 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/22 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBusy ? "…" : "Approuver"}
        </Button>
        <Button
          onClick={() => { setRejectingId(item.id); setRejectReason(""); }}
          disabled={isBusy}
          size="sm"
          variant="destructive"
          className="h-7 px-2 text-xs"
        >
          Refuser
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <MotionButtonFrame>
          <Button onClick={() => load()} variant="outline" size="sm" className="rounded-2xl border-white/10 bg-white/[0.04]">
            Recharger
          </Button>
        </MotionButtonFrame>
      </div>

        {/* ── FORM ── */}
        <SectionCard title="Nouvelle absence" description="Déclarer une absence pour un membre">
          <form onSubmit={onCreate} className="space-y-6">

            {/* ─ Sélection membre ─ */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Membre concerné
              </p>
              <MemberPicker value={selectedMember} onChange={setSelectedMember} />
            </div>

            {/* ─ Type selector ─ */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Type d'absence
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(["GENERAL", "MEETING"] as const).map((t) => {
                  const active = formData.type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, type: t, meetingDate: "", startAt: "", endAt: "" })
                      }
                      className={`flex flex-col gap-1.5 px-4 py-4 rounded-xl border text-left transition-all ${
                        active
                          ? t === "GENERAL"
                            ? "bg-violet-500/15 border-violet-500/50 text-violet-200"
                            : "bg-amber-500/12 border-amber-500/40 text-amber-200"
                          : "bg-white/4 border-white/8 text-muted-foreground hover:border-white/15 hover:text-foreground"
                      }`}
                    >
                      <span className="font-semibold text-sm">
                        {t === "GENERAL" ? "⏱ Absence générale" : "📅 Absence réunion"}
                      </span>
                      <span className="text-xs opacity-70">
                        {t === "GENERAL"
                          ? "Période de début à fin — max 2 mois"
                          : "Dimanche 21h — normalisé automatiquement"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─ Dates selon type ─ */}
            {formData.type === "GENERAL" ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Période d'absence
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Date de début
                    </label>
                    <Input
                      type="datetime-local"
                      value={formData.startAt}
                      onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                      required
                      className="bg-slate-900/40 border-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Date de fin{" "}
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Max 2 mois
                      </span>
                    </label>
                    <Input
                      type="datetime-local"
                      value={formData.endAt}
                      onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                      required
                      className="bg-slate-900/40 border-slate-800"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Réunion concernée
                </p>
                <div className="max-w-xs">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Date de la réunion
                  </label>
                  <Input
                    type="date"
                    value={formData.meetingDate}
                    onChange={(e) => setFormData({ ...formData, meetingDate: e.target.value })}
                    required
                    className="bg-slate-900/40 border-slate-800"
                  />
                </div>
                <p className="mt-2 text-xs text-amber-400/70">
                  La réunion sera normalisée au dimanche de la semaine choisie à 21h00.
                </p>
              </div>
            )}

            {/* ─ Raison / Notes ─ */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Détails
              </p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Raison</label>
                  <Input
                    type="text"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="Ex: Vacances, Maladie, Déplacement..."
                    className="bg-slate-900/40 border-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Notes <span className="opacity-50">(optionnel)</span>
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Informations supplémentaires..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground placeholder-gray-500 text-sm focus:outline-none focus:border-slate-600 resize-none"
                  />
                </div>
              </div>
            </div>

            {formError && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                <span className="shrink-0">❌</span>
                <div>{formError}</div>
              </div>
            )}

            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? "Création en cours..." : "Créer l'absence"}
            </Button>
          </form>
        </SectionCard>

        {/* ── LIST ── */}
        <SectionCard
          title="Liste des absences"
          description={`${total} absence${total !== 1 ? "s" : ""} au total`}
        >
          <div className="space-y-4">

            {/* Filtres */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Statut</label>
                <select
                  value={pendingFilters.status}
                  onChange={(e) => setPendingFilters({ ...pendingFilters, status: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground text-sm focus:outline-none"
                >
                  <option value="">Tous les statuts</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Du</label>
                <Input
                  type="date"
                  value={pendingFilters.dateFrom}
                  onChange={(e) => setPendingFilters({ ...pendingFilters, dateFrom: e.target.value })}
                  className="bg-slate-900/40 border-slate-800"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Au</label>
                <Input
                  type="date"
                  value={pendingFilters.dateTo}
                  onChange={(e) => setPendingFilters({ ...pendingFilters, dateTo: e.target.value })}
                  className="bg-slate-900/40 border-slate-800"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-white/10 bg-white/[0.04]"
                  onClick={() => {
                    setFilters({ ...pendingFilters });
                    setPage(1);
                  }}
                >
                  Appliquer
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-2xl"
                  onClick={() => {
                    setPendingFilters({ status: "", dateFrom: "", dateTo: "" });
                    setFilters({ status: "", dateFrom: "", dateTo: "" });
                    setPage(1);
                  }}
                >
                  Réinitialiser
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                <span className="shrink-0">❌</span>
                <div>{error}</div>
              </div>
            )}

            {loading ? (
              <SkeletonTable rows={5} cols={6} />
            ) : items.length === 0 ? (
              <EmptyState
                title="Aucune absence"
                description="Aucune absence trouvée pour les filtres actuels"
                icon="📅"
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/40">
                      {["Membre", "Type", "Période / Réunion", "Motif", "Statut", "Décidé le", "Validé par", "Actions"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-800/40 hover:bg-slate-900/30 transition-colors ${
                          idx % 2 === 0 ? "bg-slate-900/10" : ""
                        }`}
                      >
                        {/* Membre */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {item.member?.rpName ?? "—"}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            {item.member?.discordId ?? item.discordId ?? "—"}
                          </div>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3">
                          <StatusBadge tone={TYPE_TONES[item.type]} className={TYPE_COLORS[item.type]}>
                            {TYPE_LABELS[item.type]}
                          </StatusBadge>
                        </td>

                        {/* Période / réunion */}
                        <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">
                          {item.type === "MEETING" && item.meetingDate ? (
                            <div className="text-amber-300">{fmtDate(item.meetingDate)}</div>
                          ) : (
                            <>
                              <div>{fmtDateShort(item.startAt)}</div>
                              <div className="text-muted-foreground">→ {fmtDateShort(item.endAt)}</div>
                            </>
                          )}
                        </td>

                        {/* Motif */}
                        <td className="px-4 py-3 max-w-[180px]">
                          <div className="text-xs text-foreground truncate">{item.reason ?? "—"}</div>
                          {item.rejectionReason && (
                            <div
                              className="text-[11px] text-rose-300 mt-0.5 truncate"
                              title={item.rejectionReason}
                            >
                              Refus : {item.rejectionReason}
                            </div>
                          )}
                          {item.notes && (
                            <div
                              className="text-[11px] text-muted-foreground mt-0.5 truncate"
                              title={item.notes}
                            >
                              {item.notes}
                            </div>
                          )}
                        </td>

                        {/* Statut */}
                        <td className="px-4 py-3">
                          <StatusBadge tone={STATUS_TONES[item.uiStatus]} className={STATUS_COLORS[item.uiStatus]}>
                            {STATUS_LABELS[item.uiStatus]}
                          </StatusBadge>
                        </td>

                        {/* Décidé le */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {item.decidedAt ? fmtDate(item.decidedAt) : "—"}
                        </td>

                        {/* Validé par */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {item.decidedBy ? (
                            <span className="text-slate-300 font-medium">
                              {item.decidedBy.rpName || item.decidedBy.name || "—"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">{renderActions(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {total > 0 && (
              <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                <span>
                  Page {page} / {totalPages} · {total} élément{total !== 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-2xl border-white/10 bg-white/[0.04]"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Précédent
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-2xl border-white/10 bg-white/[0.04]"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
    </div>
  );
}
