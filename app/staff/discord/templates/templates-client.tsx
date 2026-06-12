"use client";

import { getErrorMessage } from "@/lib/errors";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  Inbox,
  MessageSquareWarning,
  MessagesSquare,
  Pencil,
  RotateCcw,
  Save,
  Scale,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PageShell } from "@/components/staff/ui/PageShell";

type Template = {
  id: string;
  familyId: string;
  key: string;
  title: string | null;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/* ──────────────────────────────────────────────────────────────────────
 * Noms humains des modèles — aucune clé technique n'est affichée à l'écran.
 * ────────────────────────────────────────────────────────────────────── */
const KEY_LABELS: Record<string, string> = {
  "recruitment.submitted":          "Candidature reçue",
  "recruitment.accepted":           "Candidature acceptée",
  "recruitment.rejected":           "Candidature refusée",
  "complaint.created":              "Nouvelle plainte",
  "sanction.created":               "Sanction appliquée",
  "absence.requested":              "Absence demandée",
  "absence.approved":               "Absence approuvée",
  "ME_ABSENCE_CREATED":             "Absence déclarée par un membre",
  "ME_ABSENCE_JUSTIFIED":           "Absence justifiée par un membre",
  "absence_justification_created":  "Justificatif d'absence déposé",
  "sanction_justification_created": "Justificatif de sanction déposé",
  "ME_SANCTION_JUSTIFIED":          "Sanction justifiée par un membre",
  "BANK_DEBT_PING_SINGLE":          "Rappel de dette",
  "meeting.scheduled":              "Réunion programmée",
};

function getKeyLabel(key: string): string {
  return KEY_LABELS[key] ?? "Message automatique";
}

/* Quand et où chaque message part — la phrase affichée sous le nom. */
const KEY_DESTINATIONS: Record<string, string> = {
  "recruitment.submitted":          "Envoyé à la réception d'une candidature, dans le salon recrutement.",
  "recruitment.accepted":           "Envoyé quand une candidature est acceptée, au candidat (DM) et dans le salon recrutement.",
  "recruitment.rejected":           "Envoyé quand une candidature est refusée, au candidat (DM) et dans le salon recrutement.",
  "complaint.created":              "Envoyé à l'ouverture d'une plainte, dans le salon plaintes.",
  "sanction.created":               "Envoyé quand une sanction est appliquée, dans le salon sanctions.",
  "absence.requested":              "Envoyé quand un membre demande une absence, dans le salon absences.",
  "absence.approved":               "Envoyé quand une absence est validée, dans le salon absences.",
  "ME_ABSENCE_CREATED":             "Envoyé quand un membre déclare une absence depuis son espace, dans le salon absences.",
  "ME_ABSENCE_JUSTIFIED":           "Envoyé quand un membre justifie une absence depuis son espace, dans le salon absences.",
  "absence_justification_created":  "Envoyé quand un justificatif d'absence est déposé, dans le salon absences.",
  "sanction_justification_created": "Envoyé quand un justificatif de sanction est déposé, dans le salon sanctions.",
  "ME_SANCTION_JUSTIFIED":          "Envoyé quand un membre justifie une sanction depuis son espace, dans le salon sanctions.",
  "BANK_DEBT_PING_SINGLE":          "Envoyé automatiquement au membre endetté (avec ping), dans le salon alertes banque.",
  "meeting.scheduled":              "Envoyé quand une réunion est programmée, dans le salon réunions.",
};

/* ──────────────────────────────────────────────────────────────────────
 * Variables : label français (la puce) + valeur d'exemple (l'aperçu).
 * ────────────────────────────────────────────────────────────────────── */
const VAR_INFO: Record<string, { label: string; fake: string }> = {
  "{{mention}}":                { label: "Mention du joueur",   fake: "@JuanMorales" },
  "{{rpName}}":                 { label: "Nom RP",              fake: "Juan Morales" },
  "{{discordId}}":              { label: "ID Discord",          fake: "123456789012345678" },
  "{{steamId}}":                { label: "SteamID",             fake: "76561198000000000" },
  "{{familyName}}":             { label: "Nom de la famille",   fake: "Los Esperados" },
  "{{age}}":                    { label: "Âge",                 fake: "23" },
  "{{grade}}":                  { label: "Grade",               fake: "Soldado" },
  "{{type}}":                   { label: "Type de sanction",    fake: "Avertissement" },
  "{{reason}}":                 { label: "Motif",               fake: "Non-respect du règlement" },
  "{{points}}":                 { label: "Points",              fake: "5" },
  "{{startAt}}":                { label: "Date de début",       fake: "01/07/2026" },
  "{{endAt}}":                  { label: "Date de fin",         fake: "15/07/2026" },
  "{{scheduledAt}}":            { label: "Date et heure",       fake: "14/06/2026 21:00" },
  "{{title}}":                  { label: "Titre",               fake: "Réunion du dimanche" },
  "{{message}}":                { label: "Message du membre",   fake: "Je ne pouvais pas être présent." },
  "{{deficitAmountFormatted}}": { label: "Montant de la dette", fake: "25 000 €" },
};

/* Variables réellement disponibles PAR modèle (clé absente = toutes, prudence). */
const COMMON_VARS = ["{{mention}}", "{{rpName}}", "{{discordId}}", "{{familyName}}"];
const VARS_BY_KEY: Record<string, string[]> = {
  "recruitment.submitted":          [...COMMON_VARS, "{{age}}", "{{steamId}}"],
  "recruitment.accepted":           [...COMMON_VARS, "{{age}}", "{{steamId}}"],
  "recruitment.rejected":           [...COMMON_VARS, "{{age}}", "{{steamId}}", "{{reason}}"],
  "complaint.created":              [...COMMON_VARS, "{{title}}", "{{message}}"],
  "sanction.created":               [...COMMON_VARS, "{{type}}", "{{reason}}", "{{points}}", "{{grade}}"],
  "sanction_justification_created": [...COMMON_VARS, "{{type}}", "{{reason}}", "{{message}}"],
  "ME_SANCTION_JUSTIFIED":          [...COMMON_VARS, "{{type}}", "{{reason}}", "{{message}}"],
  "absence.requested":              [...COMMON_VARS, "{{startAt}}", "{{endAt}}", "{{message}}"],
  "absence.approved":               [...COMMON_VARS, "{{startAt}}", "{{endAt}}"],
  "ME_ABSENCE_CREATED":             [...COMMON_VARS, "{{startAt}}", "{{endAt}}", "{{message}}"],
  "ME_ABSENCE_JUSTIFIED":           [...COMMON_VARS, "{{startAt}}", "{{endAt}}", "{{message}}"],
  "absence_justification_created":  [...COMMON_VARS, "{{startAt}}", "{{endAt}}", "{{message}}"],
  "BANK_DEBT_PING_SINGLE":          ["{{mention}}", "{{rpName}}", "{{deficitAmountFormatted}}", "{{familyName}}"],
  "meeting.scheduled":              ["{{mention}}", "{{title}}", "{{scheduledAt}}", "{{familyName}}"],
};

/* Contenus par défaut (miroir du backend) — pour le badge "Personnalisé"
 * et le bouton "Rétablir le défaut". */
const DEFAULT_CONTENTS: Record<string, string> = {
  "recruitment.submitted":          "📥 Nouvelle candidature reçue\n\n👤 {{rpName}} (<@{{discordId}}>)\n🎮 Steam : {{steamId}}\n🎂 Âge : {{age}}",
  "recruitment.accepted":           "✅ Candidature acceptée\n\n👤 {{rpName}} (<@{{discordId}}>)\n🎮 Steam : {{steamId}}\n\nBienvenue dans la famille !",
  "recruitment.rejected":           "❌ Candidature refusée\n\n👤 {{rpName}} (<@{{discordId}}>)\n🎮 Steam : {{steamId}}",
  "complaint.created":              "📋 Nouvelle plainte — {{title}}\n\nPlaignant : <@{{complainantId}}>\nContre : <@{{targetId}}>",
  "sanction.created":               "⚠️ Sanction appliquée — {{type}}\n\nMembre : <@{{discordId}}>\nMotif : {{reason}}\nPoints : {{points}}",
  "absence.requested":              "📅 Absence déclarée\n\nMembre : <@{{discordId}}>\nDu {{startAt}} au {{endAt}}",
  "ME_ABSENCE_CREATED":             "📅 Absence enregistrée\n\nMembre : <@{{discordId}}>\nDu {{startAt}} au {{endAt}}",
  "absence_justification_created":  "📎 Justificatif d'absence soumis\n\nMembre : <@{{discordId}}>",
  "ME_ABSENCE_JUSTIFIED":           "📎 Justificatif d'absence soumis\n\nMembre : <@{{discordId}}>\nMessage : {{message}}",
  "sanction_justification_created": "📎 Justificatif de sanction soumis\n\nMembre : <@{{discordId}}>",
  "ME_SANCTION_JUSTIFIED":          "📎 Justificatif de sanction soumis\n\nMembre : <@{{discordId}}>\nMessage : {{message}}",
  "BANK_DEBT_PING_SINGLE":          "{{mention}} tu es actuellement en déficit de **{{deficitAmountFormatted}}** sur le compte bancaire de la famille.\n\nMerci de régulariser ta situation dans les plus brefs délais. En cas de problème, contacte un État-Major.",
  "absence.approved":               "✅ Absence approuvée\n\nMembre : <@{{discordId}}>\nDu {{startAt}} au {{endAt}}",
  "meeting.scheduled":              "📅 Réunion programmée — {{title}}\n\nRendez-vous le {{scheduledAt}}",
};

/* ──────────────────────────────────────────────────────────────────────
 * Catégories — déduites des préfixes de clés. Ordre d'affichage fixe.
 * ────────────────────────────────────────────────────────────────────── */
type Category = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (key: string) => boolean;
};

const CATEGORIES: Category[] = [
  { id: "recruitment", label: "Recrutement", icon: Inbox,                 match: (k) => k.startsWith("recruitment.") },
  { id: "complaint",   label: "Plaintes",    icon: MessageSquareWarning,  match: (k) => k.startsWith("complaint.") },
  { id: "sanction",    label: "Sanctions",   icon: Scale,                 match: (k) => k.startsWith("sanction") || k.startsWith("ME_SANCTION") },
  { id: "absence",     label: "Absences",    icon: CalendarOff,           match: (k) => k.startsWith("absence") || k.startsWith("ME_ABSENCE") },
  { id: "meeting",     label: "Réunions",    icon: CalendarClock,         match: (k) => k.startsWith("meeting.") },
  { id: "bank",        label: "Banque",      icon: Banknote,              match: (k) => k.startsWith("BANK_") },
];

const FALLBACK_CATEGORY: Category = {
  id: "other",
  label: "Autres messages",
  icon: MessagesSquare,
  match: () => true,
};

/* Ordre logique des modèles à l'intérieur d'une catégorie. */
const KEY_ORDER = [
  "recruitment.submitted",
  "recruitment.accepted",
  "recruitment.rejected",
  "complaint.created",
  "sanction.created",
  "sanction_justification_created",
  "ME_SANCTION_JUSTIFIED",
  "absence.requested",
  "absence.approved",
  "ME_ABSENCE_CREATED",
  "absence_justification_created",
  "ME_ABSENCE_JUSTIFIED",
  "BANK_DEBT_PING_SINGLE",
  "meeting.scheduled",
];

function keyOrderIndex(key: string): number {
  const idx = KEY_ORDER.indexOf(key);
  return idx === -1 ? KEY_ORDER.length : idx;
}

/* ──────────────────────────────────────────────────────────────────────
 * Aperçu façon Discord : variables remplacées par des exemples réalistes,
 * gras **…** rendu, mentions stylées en pilule bleue.
 * ────────────────────────────────────────────────────────────────────── */

/* Motifs présents dans certains défauts mais qui ne sont pas des puces. */
const PREVIEW_ONLY_FAKES: Record<string, string> = {
  "<@{{discordId}}>":     "@JuanMorales",
  "<@{{complainantId}}>": "@MariaSantos",
  "<@{{targetId}}>":      "@DiegoFuentes",
  "{{complainantId}}":    "@MariaSantos",
  "{{targetId}}":         "@DiegoFuentes",
  "{{absenceId}}":        "42",
  "{{sanctionId}}":       "42",
};

function fillExamples(text: string): string {
  let result = text;
  for (const [pattern, fake] of Object.entries(PREVIEW_ONLY_FAKES)) {
    result = result.replaceAll(pattern, fake);
  }
  for (const [varKey, info] of Object.entries(VAR_INFO)) {
    result = result.replaceAll(varKey, info.fake);
  }
  return result;
}

function renderMentionSegments(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(@[\p{L}\p{N}_]+)/gu).map((part, i) =>
    part.startsWith("@") ? (
      <span
        key={`${keyPrefix}-m${i}`}
        className="rounded-[3px] bg-[#5865f2]/30 px-0.5 font-medium text-[#c9cdfb]"
      >
        {part}
      </span>
    ) : (
      <span key={`${keyPrefix}-s${i}`}>{part}</span>
    )
  );
}

function renderDiscordContent(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length >= 5 ? (
      <strong key={`b${i}`} className="font-semibold text-white">
        {renderMentionSegments(part.slice(2, -2), `b${i}`)}
      </strong>
    ) : (
      <span key={`t${i}`}>{renderMentionSegments(part, `t${i}`)}</span>
    )
  );
}

function DiscordMessage({ content, compact = false }: { content: string; compact?: boolean }) {
  const filled = fillExamples(content);
  const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={`rounded-xl border border-white/5 bg-[#313338] ${compact ? "px-3 py-2.5" : "p-4"}`}>
      <div className="flex items-start gap-3">
        <div
          className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#9b2335] to-[#5a1620] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${
            compact ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs"
          }`}
        >
          LE
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-sm font-semibold text-white">Los Esperados</span>
            <span className="rounded bg-[#5865f2] px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white">
              App
            </span>
            <span className="text-[10px] text-[#949ba4]">Aujourd&apos;hui à {time}</span>
          </div>
          <div
            className={`whitespace-pre-wrap break-words text-[#dbdee1] ${
              compact ? "mt-0.5 line-clamp-4 text-[12.5px] leading-[1.45]" : "mt-1 text-[13.5px] leading-relaxed"
            }`}
          >
            {filled.trim() ? (
              renderDiscordContent(filled)
            ) : (
              <span className="italic text-[#80848e]">Ton message apparaîtra ici…</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * Éditeur en place : deux zones (message + aperçu live), puces d'insertion.
 * ────────────────────────────────────────────────────────────────────── */
function TemplateEditor({
  item,
  onCancel,
  onSaved,
}: {
  item: Template;
  onCancel: () => void;
  onSaved: (updated: Template) => void;
}) {
  const [content, setContent] = useState(item.content);
  const [enabled, setEnabled] = useState(Boolean(item.enabled));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chipKeys = VARS_BY_KEY[item.key] ?? Object.keys(VAR_INFO);
  const defaultContent = DEFAULT_CONTENTS[item.key] ?? null;
  const hasChanges = content !== item.content || enabled !== Boolean(item.enabled);

  function insertVariable(varKey: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((c) => c + varKey);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = content.substring(0, start) + varKey + content.substring(end);
    setContent(next);
    setTimeout(() => {
      textarea.focus();
      const pos = start + varKey.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/staff/discord/templates/${encodeURIComponent(item.key)}?familyId=esperados`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, enabled }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Sauvegarde échouée");
      onSaved(json.data as Template);
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Gauche : le message */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Ton message
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chipKeys.map((varKey) => {
              const info = VAR_INFO[varKey];
              if (!info) return null;
              const used = content.includes(varKey);
              return (
                <button
                  key={varKey}
                  type="button"
                  onClick={() => insertVariable(varKey)}
                  title={`Exemple : ${info.fake}`}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    used
                      ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-200"
                  }`}
                >
                  {info.label}
                </button>
              );
            })}
          </div>
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Rédige ton message ici…"
            className="min-h-[220px] resize-y rounded-xl border-white/10 bg-[rgba(10,4,6,0.85)] text-[13px] leading-relaxed focus-visible:ring-amber-500/40"
          />
        </div>

        {/* Droite : aperçu live */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Aperçu Discord
          </div>
          <DiscordMessage content={content} />
        </div>
      </div>

      {saveError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{saveError}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-white/8 pt-4">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          Envoi automatique activé
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {defaultContent && content !== defaultContent && (
            <button
              type="button"
              onClick={() => setContent(defaultContent)}
              disabled={saving}
              className="btn-press inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Rétablir le défaut
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="btn-press btn-press-neutral rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 hover:bg-white/[0.08] disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges || !content.trim()}
            className="btn-press btn-press-amber inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-500/25 to-amber-600/10 px-4 py-2 text-sm font-semibold text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * Carte d'un modèle : nom humain, phrase de contexte, aperçu compact,
 * et édition en place quand on clique sur Modifier.
 * ────────────────────────────────────────────────────────────────────── */
function TemplateCard({
  item,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  item: Template;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (updated: Template) => void;
}) {
  const defaultContent = DEFAULT_CONTENTS[item.key] ?? null;
  const customized = defaultContent !== null && item.content !== defaultContent;
  const destination = KEY_DESTINATIONS[item.key] ?? null;

  return (
    <article
      className={`premium-surface-elevated relative overflow-hidden rounded-2xl border bg-white/[0.03] p-4 backdrop-blur transition-colors sm:p-5 ${
        editing ? "border-amber-500/30 lg:col-span-2" : "border-white/8"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight text-slate-100">
              {getKeyLabel(item.key)}
            </h3>
            {customized && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                Personnalisé
              </span>
            )}
            {!item.enabled && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-slate-400">
                Désactivé
              </span>
            )}
          </div>
          {destination && <p className="mt-1 text-xs leading-5 text-slate-400">{destination}</p>}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={onEdit}
            className="btn-press btn-press-amber inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-500/40 hover:text-amber-200"
          >
            <Pencil className="h-3.5 w-3.5" />
            Modifier
          </button>
        )}
      </div>

      {editing ? (
        <TemplateEditor item={item} onCancel={onCancel} onSaved={onSaved} />
      ) : (
        <div className={`mt-3 ${item.enabled ? "" : "opacity-60"}`}>
          <DiscordMessage content={item.content} compact />
        </div>
      )}
    </article>
  );
}

/* ──────────────────────────────────────────────────────────────────────
 * Page : liste des modèles regroupés par catégorie.
 * ────────────────────────────────────────────────────────────────────── */
export default function DiscordTemplatesClient() {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/discord/templates?familyId=esperados", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Chargement échoué");
      setItems(json.data ?? []);
    } catch (err: unknown) {
      setItems([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleSaved(updated: Template) {
    setItems((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditingKey(null);
    setToast("Message enregistré");
    window.setTimeout(() => setToast(null), 2500);
  }

  const sorted = [...items].sort((a, b) => keyOrderIndex(a.key) - keyOrderIndex(b.key));
  const remaining = new Set(sorted.map((t) => t.key));
  const groups = [...CATEGORIES, FALLBACK_CATEGORY]
    .map((cat) => {
      const catItems = sorted.filter((t) => remaining.has(t.key) && cat.match(t.key));
      catItems.forEach((t) => remaining.delete(t.key));
      return { cat, items: catItems };
    })
    .filter((g) => g.items.length > 0);

  return (
    <PageShell
      title="Messages Discord"
      description="Personnalise les messages que le bot envoie automatiquement — chaque carte montre un aperçu fidèle de ce qui partira sur Discord."
      icon={MessagesSquare}
    >
      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">Chargement des modèles…</div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-8 pb-12">
          <p className="text-[13px] leading-5 text-slate-400">
            Clique sur <span className="font-medium text-slate-200">Modifier</span>, puis sur une puce
            pour insérer une info qui sera remplacée automatiquement au moment de l&apos;envoi.
          </p>

          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">Aucun modèle disponible.</p>
          )}

          {groups.map(({ cat, items: catItems }) => (
            <section key={cat.id} className="space-y-3">
              <div className="flex items-center gap-2.5 px-0.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#7a1f2b]/45 bg-gradient-to-br from-[#7a1f2b]/35 to-[#4a0f18]/20 shadow-[0_6px_16px_-6px_rgba(155,35,53,0.5),inset_0_1px_0_rgba(255,255,255,0.07)]">
                  <cat.icon className="h-4 w-4 text-amber-300 drop-shadow-[0_0_4px_rgba(245,158,11,0.45)]" />
                </div>
                <h2 className="text-base font-semibold tracking-tight text-slate-50">{cat.label}</h2>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {catItems.map((item) => (
                  <TemplateCard
                    key={item.id}
                    item={item}
                    editing={editingKey === item.key}
                    onEdit={() => setEditingKey(item.key)}
                    onCancel={() => setEditingKey(null)}
                    onSaved={handleSaved}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-[#0d1a12]/95 px-4 py-2.5 text-sm text-emerald-200 shadow-[0_18px_50px_rgba(0,0,0,0.6)] backdrop-blur">
          <CheckCircle2 className="h-4 w-4" />
          {toast}
        </div>
      )}
    </PageShell>
  );
}
