"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Copy, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { Button } from "@/components/ui/button";

type Question = {
  id?: string;
  section: "GENERAL" | "TRAP";
  label: string;
  pointsMax: number;
  expectedAnswer?: string;
  hint?: string;
  step?: number;
};

type Model = {
  id: string;
  name: string;
  description: string | null;
  minOn20: number;
  isDefault: boolean;
  isActive: boolean;
  questionCount: number;
  totalMaxPoints: number;
  questions: Question[];
};

type Draft = {
  id: string | null; // null = création
  name: string;
  description: string;
  minOn20: number;
  questions: Question[];
};

function emptyQuestion(): Question {
  return { section: "GENERAL", label: "", pointsMax: 1, expectedAnswer: "" };
}

function sumPoints(questions: Question[]): number {
  return Math.round(questions.reduce((a, q) => a + (Number(q.pointsMax) || 0), 0) * 100) / 100;
}

export default function RecruitmentModelsClient() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/recruitment-models?questions=1", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec du chargement");
      setModels(json.models ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate(base?: Model) {
    setDraft({
      id: null,
      name: base ? `${base.name} (copie)` : "",
      description: base?.description ?? "",
      minOn20: base?.minOn20 ?? 14,
      questions: base ? base.questions.map((q) => ({ ...q })) : [emptyQuestion()],
    });
    setError(null);
  }

  function startEdit(m: Model) {
    setDraft({
      id: m.id,
      name: m.name,
      description: m.description ?? "",
      minOn20: m.minOn20,
      questions: m.questions.map((q) => ({ ...q })),
    });
    setError(null);
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: draft.name,
        description: draft.description,
        minOn20: draft.minOn20,
        questions: draft.questions,
      };
      const res = await fetch(
        draft.id ? `/api/staff/recruitment-models/${draft.id}` : "/api/staff/recruitment-models",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const code = json?.error;
        throw new Error(
          code === "NAME_TOO_SHORT"
            ? "Le nom doit faire au moins 3 caractères."
            : code === "NO_QUESTIONS"
              ? "Ajoute au moins une question valide (intitulé + points > 0)."
              : code || "Sauvegarde échouée"
        );
      }
      setDraft(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function modelAction(id: string, body: Record<string, unknown>, method: "PATCH" | "DELETE" = "PATCH") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/staff/recruitment-models/${id}`, {
        method,
        ...(method === "PATCH"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const code = json?.error;
        throw new Error(
          code === "CANNOT_DELETE_DEFAULT"
            ? "Impossible de supprimer le modèle par défaut — définis-en un autre d'abord."
            : code === "CANNOT_DISABLE_DEFAULT"
              ? "Impossible de désactiver le modèle par défaut."
              : code || "Action échouée"
        );
      }
      setConfirmDeleteId(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function updateQuestion(index: number, patch: Partial<Question>) {
    setDraft((d) => {
      if (!d) return d;
      const questions = d.questions.map((q, i) => (i === index ? { ...q, ...patch } : q));
      return { ...d, questions };
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* ── Éditeur (création / édition) ─────────────────────────────────── */}
      {draft ? (
        <SectionCard
          title={draft.id ? "Modifier le modèle" : "Nouveau modèle"}
          description="Chaque question a un intitulé, une section, un barème et une réponse attendue (affichée au recruteur pendant l'entretien)."
          icon={Pencil}
          actions={
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-full border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 hover:text-slate-200"
              title="Fermer sans sauvegarder"
            >
              <X className="h-4 w-4" />
            </button>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nom du modèle</span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ex. Recrutement rapide, Recrutement Encadrant…"
                  className="rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Seuil minimum /20</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={draft.minOn20}
                  onChange={(e) => setDraft({ ...draft, minOn20: Number(e.target.value) })}
                  className="rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-2 text-sm text-slate-100 focus:border-amber-500/40 focus:outline-none"
                />
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Description (optionnelle)</span>
              <input
                type="text"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="À quoi sert ce modèle ?"
                className="rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
              />
            </label>

            {/* Questions */}
            <div className="space-y-3">
              {draft.questions.map((q, i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">#{i + 1}</span>
                    <select
                      value={q.section}
                      onChange={(e) => updateQuestion(i, { section: e.target.value as Question["section"] })}
                      className="rounded-lg border border-white/10 bg-[rgba(10,4,6,0.85)] px-2 py-1.5 text-xs text-slate-200 focus:border-amber-500/40 focus:outline-none"
                    >
                      <option value="GENERAL">Question générale</option>
                      <option value="TRAP">Question piège</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                      Points :
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={q.pointsMax}
                        onChange={(e) => updateQuestion(i, { pointsMax: Number(e.target.value) })}
                        className="w-20 rounded-lg border border-white/10 bg-[rgba(10,4,6,0.85)] px-2 py-1.5 text-xs text-slate-100 focus:border-amber-500/40 focus:outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((d) => (d ? { ...d, questions: d.questions.filter((_, j) => j !== i) } : d))
                      }
                      className="ml-auto rounded-full border border-red-500/20 bg-red-500/10 p-1.5 text-red-300/80 transition-colors hover:bg-red-500/20"
                      title="Supprimer cette question"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={q.label}
                    onChange={(e) => updateQuestion(i, { label: e.target.value })}
                    placeholder="Intitulé de la question…"
                    rows={2}
                    className="mt-3 w-full resize-y whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-2 text-sm leading-6 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
                  />
                  <textarea
                    value={q.expectedAnswer ?? ""}
                    onChange={(e) => updateQuestion(i, { expectedAnswer: e.target.value })}
                    placeholder="Réponse attendue (affichée au recruteur)…"
                    rows={2}
                    className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-2 text-xs leading-5 text-slate-200 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
                  />
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({ ...draft, questions: [...draft.questions, emptyQuestion()] })}
                  className="rounded-2xl border-white/10 bg-white/[0.04]"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Ajouter une question
                </Button>
                <span className="text-xs text-slate-500">
                  {draft.questions.length} question{draft.questions.length > 1 ? "s" : ""} · {sumPoints(draft.questions)} pts max
                </span>
              </div>
            </div>

            <div className="flex gap-3 border-t border-white/10 pt-4">
              <Button onClick={saveDraft} disabled={saving}>
                {saving ? "Sauvegarde…" : draft.id ? "Enregistrer les modifications" : "Créer le modèle"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
                Annuler
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : (
        <div className="flex justify-end">
          <Button onClick={() => startCreate()} className="rounded-2xl">
            <Plus className="mr-1.5 h-4 w-4" />
            Nouveau modèle
          </Button>
        </div>
      )}

      {/* ── Liste des modèles ─────────────────────────────────────────────── */}
      <SectionCard
        title="Modèles existants"
        description="Le modèle par défaut est utilisé quand il n'y en a qu'un seul actif. Avec plusieurs modèles actifs, le recruteur choisit au lancement du test."
        icon={ClipboardList}
      >
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Chargement…</div>
        ) : models.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">Aucun modèle — crée le premier.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {models.map((m) => (
              <div
                key={m.id}
                className={`rounded-2xl border px-4 py-3 transition-colors ${
                  m.isDefault ? "border-amber-400/25 bg-amber-400/[0.04]" : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-100">{m.name}</span>
                      {m.isDefault && (
                        <StatusBadge tone="warning" className="text-[10px]">
                          ★ Par défaut
                        </StatusBadge>
                      )}
                      {!m.isActive && (
                        <StatusBadge tone="neutral" className="text-[10px]">
                          Inactif
                        </StatusBadge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {m.questionCount} questions · {m.totalMaxPoints} pts max · seuil {m.minOn20}/20
                      {m.description ? ` — ${m.description}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(m)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-amber-500/30 hover:text-amber-200"
                    >
                      <Pencil className="h-3 w-3" /> Éditer
                    </button>
                    <button
                      type="button"
                      onClick={() => startCreate(m)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-sky-500/30 hover:text-sky-200"
                    >
                      <Copy className="h-3 w-3" /> Dupliquer
                    </button>
                    {!m.isDefault && (
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => modelAction(m.id, { isDefault: true })}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-amber-500/30 hover:text-amber-200 disabled:opacity-50"
                      >
                        <Star className="h-3 w-3" /> Par défaut
                      </button>
                    )}
                    {!m.isDefault && (
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => modelAction(m.id, { isActive: !m.isActive })}
                        className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-white/25 disabled:opacity-50"
                      >
                        {m.isActive ? "Désactiver" : "Activer"}
                      </button>
                    )}
                    {!m.isDefault &&
                      (confirmDeleteId === m.id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === m.id}
                            onClick={() => modelAction(m.id, {}, "DELETE")}
                            className="rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-red-200 disabled:opacity-50"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-400"
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(m.id)}
                          className="inline-flex items-center rounded-full border border-red-500/20 bg-red-500/10 p-1.5 text-red-300/80 hover:bg-red-500/20"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
