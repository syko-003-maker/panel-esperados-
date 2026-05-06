"use client";

import { getErrorMessage } from "@/lib/errors";

import { useEffect, useState, useRef } from "react";
import { Search, Copy, RotateCcw, Save, AlertCircle, Eye, FileText, Zap, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge-new";
import { Card } from "@/components/ui/card";
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

// Traduction des clés techniques en labels lisibles pour la sidebar
const KEY_LABELS: Record<string, string> = {
  "recruitment.submitted":          "Recrutement soumis",
  "recruitment.accepted":           "Recrutement accepté",
  "recruitment.rejected":           "Recrutement refusé",
  "complaint.created":              "Plainte créée",
  "sanction.created":               "Sanction créée",
  "absence.requested":              "Absence demandée",
  "absence.approved":               "Absence approuvée",
  "ME_ABSENCE_CREATED":             "Absence créée (membre)",
  "ME_ABSENCE_JUSTIFIED":           "Absence justifiée (membre)",
  "absence_justification_created":  "Justificatif d'absence",
  "sanction_justification_created": "Justificatif de sanction",
  "ME_SANCTION_JUSTIFIED":          "Sanction justifiée (membre)",
  "BANK_DEBT_PING_SINGLE":          "Rappel de dette",
  "meeting.scheduled":              "Réunion programmée",
};

function getKeyLabel(key: string): string {
  return KEY_LABELS[key] ?? key;
}

// Variables réellement utilisées dans les templates backend
// label = ce que l'utilisateur voit sur le bouton
// key   = ce qui est inséré dans le contenu (et remplacé côté backend)
// fake  = valeur simulée dans la prévisualisation
const VARIABLE_DEFINITIONS = [
  { key: "{{mention}}",               label: "Mention Discord",      fake: "@JuanMorales",                desc: "Ping le membre sur Discord"              },
  { key: "{{rpName}}",                label: "Nom RP",               fake: "Juan Morales",                desc: "Nom de rôle-play du membre"              },
  { key: "{{discordId}}",             label: "ID Discord",           fake: "123456789012345678",          desc: "Identifiant Discord numérique"           },
  { key: "{{steamId}}",               label: "SteamID",              fake: "76561198000000000",           desc: "Identifiant Steam du membre"             },
  { key: "{{grade}}",                 label: "Grade",                fake: "Soldado",                    desc: "Grade actuel du membre"                  },
  { key: "{{age}}",                   label: "Âge",                  fake: "23",                         desc: "Âge du candidat"                         },
  { key: "{{type}}",                  label: "Type de sanction",     fake: "AVERTISSEMENT",              desc: "Type de la sanction"                     },
  { key: "{{reason}}",                label: "Motif",                fake: "Non-respect du règlement",   desc: "Motif de la sanction ou du refus"        },
  { key: "{{points}}",                label: "Points",               fake: "5",                          desc: "Nombre de points de la sanction"         },
  { key: "{{deficitAmountFormatted}}", label: "Montant du déficit",  fake: "25 000 €",                   desc: "Montant formaté du déficit bancaire"     },
  { key: "{{startAt}}",               label: "Date de début",        fake: "01/04/2026",                 desc: "Date de début de l'absence"              },
  { key: "{{endAt}}",                 label: "Date de fin",          fake: "30/04/2026",                 desc: "Date de fin de l'absence"                },
  { key: "{{scheduledAt}}",           label: "Date prévue",          fake: "06/04/2026 21:00",           desc: "Date et heure de la réunion"             },
  { key: "{{title}}",                 label: "Titre",                fake: "Réunion du dimanche",        desc: "Titre de la réunion ou de la plainte"    },
  { key: "{{message}}",               label: "Message",              fake: "Je ne pouvais pas être présent.", desc: "Contenu du justificatif"            },
  { key: "{{familyName}}",            label: "Nom de la famille",    fake: "Los Esperados",              desc: "Nom de la famille"                       },
];

// Exemples rapides préremplis — contenu réaliste avec vraies variables
const TEMPLATE_EXAMPLES = [
  {
    name: "💰 Rappel de dette",
    content: `{{mention}} tu es actuellement en déficit de **{{deficitAmountFormatted}}** sur le compte bancaire de la famille.

Merci de régulariser ta situation rapidement. En cas de problème, contacte un État-Major.`,
  },
  {
    name: "✅ Recrutement accepté",
    content: `🎉 Félicitations {{mention}} !

Ton recrutement a été **accepté**. Bienvenue dans la famille **{{familyName}}** !
Nom RP : **{{rpName}}**

Un membre de l'État-Major va prendre contact avec toi prochainement.`,
  },
  {
    name: "❌ Recrutement refusé",
    content: `Bonjour {{mention}},

Après examen de ta candidature, nous ne sommes pas en mesure de te recruter pour le moment.
Nom RP : **{{rpName}}**

Tu peux représenter ta candidature ultérieurement. Bonne continuation.`,
  },
  {
    name: "📅 Absence approuvée",
    content: `✅ Absence validée pour {{mention}}.

Du **{{startAt}}** au **{{endAt}}**.

Bon repos et à bientôt !`,
  },
  {
    name: "⚠️ Sanction appliquée",
    content: `{{mention}} une sanction a été appliquée sur ton profil.

Type : **{{type}}**
Motif : {{reason}}

En cas de contestation, contacte un État-Major.`,
  },
];

export default function DiscordTemplatesClient() {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/discord/templates?familyId=esperados", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Chargement échoué");
      setItems(json.data ?? []);
      if (!selectedId && json.data && json.data.length > 0) {
        setSelectedId(json.data[0].id);
      }
    } catch (err: unknown) {
      setItems([]);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filteredItems = items.filter((item) => {
    const label = getKeyLabel(item.key).toLowerCase();
    const q = searchQuery.toLowerCase();
    return (
      label.includes(q) ||
      item.key.toLowerCase().includes(q) ||
      item.title?.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q)
    );
  });

  const selectedTemplate = items.find((t) => t.id === selectedId);

  return (
    <PageShell
      title="Messages Discord"
      description="Personnalisez les messages envoyés automatiquement sur Discord"
      icon={Copy}
    >
      {loading && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Chargement des modèles...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Colonne gauche : liste des modèles */}
          <div className="md:col-span-1 space-y-3">
            <Card className="p-3 bg-slate-900/40 border-slate-800 sticky top-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                <FileText className="h-3.5 w-3.5" />
                Modèles ({filteredItems.length})
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border-slate-800 pl-8 h-8 text-xs"
                />
              </div>
            </Card>

            <div className="space-y-1.5 max-h-[calc(100vh-260px)] overflow-y-auto pr-0.5">
              {filteredItems.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {searchQuery ? "Aucun résultat." : "Aucun modèle disponible."}
                </p>
              )}
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all text-sm ${
                    selectedId === item.id
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-slate-800 bg-slate-900/40 text-foreground hover:border-slate-600 hover:bg-slate-800/40"
                  }`}
                >
                  <div className="font-medium truncate">{getKeyLabel(item.key)}</div>
                  {item.title && item.title !== getKeyLabel(item.key) && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{item.title}</div>
                  )}
                  <div className={`mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${
                    item.enabled
                      ? "bg-green-500/10 border-green-500/30 text-green-300"
                      : "bg-slate-500/10 border-slate-500/30 text-slate-400"
                  }`}>
                    {item.enabled ? "✓ Actif" : "✗ Inactif"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Zone principale : éditeur */}
          <div className="md:col-span-3">
            {selectedTemplate ? (
              <TemplateEditor key={selectedTemplate.id} item={selectedTemplate} onSaved={load} />
            ) : (
              <Card className="p-12 bg-slate-900/20 border-slate-800 text-center">
                <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Sélectionnez un modèle à gauche pour l'éditer
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

function TemplateEditor({ item, onSaved }: { item: Template; onSaved: () => void }) {
  const [content, setContent] = useState(item.content);
  const [title, setTitle] = useState(item.title ?? "");
  const [enabled, setEnabled] = useState(Boolean(item.enabled));
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasChanges =
    content !== item.content ||
    title !== (item.title ?? "") ||
    enabled !== item.enabled;

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/staff/discord/templates/${encodeURIComponent(item.key)}?familyId=esperados`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, title, enabled }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Sauvegarde échouée");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      await onSaved();
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err));
      setTimeout(() => setSaveError(null), 6000);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setContent(item.content);
    setTitle(item.title ?? "");
    setEnabled(item.enabled);
    setSaveError(null);
  }

  // Insère la variable à la position du curseur dans le textarea
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

  function renderPreview(text: string): string {
    let result = text;
    VARIABLE_DEFINITIONS.forEach((v) => {
      result = result.replaceAll(v.key, v.fake);
    });
    return result;
  }

  const usedVars = VARIABLE_DEFINITIONS.filter((v) => content.includes(v.key));

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <Card className="p-4 bg-slate-900/40 border-slate-800">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-base font-semibold text-foreground">
              {getKeyLabel(item.key)}
            </span>
            <span className="text-xs font-mono text-muted-foreground bg-slate-800/60 px-2 py-0.5 rounded">
              {item.key}
            </span>
            {hasChanges && (
              <span className="text-xs text-amber-400 border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 rounded">
                ⚠ Modifications non sauvegardées
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={!hasChanges || saving}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || saving} size="sm">
              {saving ? (
                "Sauvegarde..."
              ) : saveSuccess ? (
                <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-300" />Enregistré</>
              ) : (
                <><Save className="h-3.5 w-3.5 mr-1.5" />Enregistrer</>
              )}
            </Button>
          </div>
        </div>
        {saveError && (
          <div className="mt-2 flex items-start gap-2 text-sm text-red-300 border border-red-500/30 bg-red-500/10 rounded px-3 py-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {saveError}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gauche : paramètres + exemples rapides */}
        <div className="space-y-4">
          <Card className="p-4 bg-slate-900/40 border-slate-800 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Titre du modèle
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Rappel de dette"
                className="bg-slate-950 border-slate-800 text-sm"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/20">
              <div>
                <div className="text-sm font-medium text-foreground">Activer ce modèle</div>
                <div className="text-xs text-muted-foreground mt-0.5">Le message sera envoyé automatiquement</div>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </Card>

          {/* Exemples rapides */}
          <Card className="p-3 bg-slate-900/40 border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              <Zap className="h-3 w-3" />
              Exemples préremplis
            </div>
            <div className="space-y-1.5">
              {TEMPLATE_EXAMPLES.map((ex) => (
                <button
                  key={ex.name}
                  type="button"
                  onClick={() => { setTitle(ex.name.replace(/^[\p{Emoji}\s]+/u, "").trim()); setContent(ex.content); }}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg border border-slate-700 hover:bg-slate-800/60 hover:border-slate-600 transition-colors text-foreground"
                >
                  {ex.name}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Cliquer remplace le contenu actuel.
            </p>
          </Card>
        </div>

        {/* Centre : éditeur + éléments dynamiques */}
        <div className="space-y-4">
          {/* Onglets édit / prévisualisation */}
          <div className="flex rounded-lg border border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setActiveTab("edit")}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                activeTab === "edit"
                  ? "bg-slate-800 text-foreground"
                  : "bg-slate-900/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              ✏️ Éditeur
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                activeTab === "preview"
                  ? "bg-slate-800 text-foreground"
                  : "bg-slate-900/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              👁 Aperçu
            </button>
          </div>

          {activeTab === "edit" ? (
            <Card className="p-4 bg-slate-900/40 border-slate-800 flex flex-col" style={{ minHeight: 340 }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Contenu du message
                </label>
                <span className="text-xs text-muted-foreground">{content.length} car.</span>
              </div>
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Rédigez votre message ici, puis insérez des éléments dynamiques via les boutons ci-contre →"
                className="flex-1 font-mono text-xs resize-none bg-slate-950 border-slate-800"
                style={{ minHeight: 260 }}
              />
            </Card>
          ) : (
            <Card className="p-4 bg-slate-900/40 border-slate-800 flex flex-col" style={{ minHeight: 340 }}>
              <div className="flex items-center gap-2 mb-3">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Aperçu avec données exemples
                </span>
              </div>
              {/* Bloc style Discord */}
              <div className="flex-1 rounded-xl border border-slate-700 bg-[#36393f] p-4 overflow-y-auto">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    LE
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-semibold text-white">Los Esperados</span>
                      <span className="text-[10px] text-slate-400">Aujourd'hui à {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="text-[13px] text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                      {content ? renderPreview(content) : <span className="text-slate-500 italic">Aucun contenu</span>}
                    </div>
                  </div>
                </div>
              </div>
              {usedVars.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <p className="text-[10px] text-muted-foreground mb-1.5">Éléments dynamiques utilisés :</p>
                  <div className="flex flex-wrap gap-1">
                    {usedVars.map((v) => (
                      <span key={v.key} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                        {v.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Droite : boutons d'insertion */}
        <div className="space-y-4">
          <Card className="p-3 bg-slate-900/40 border-slate-800">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Insérer un élément dynamique
            </p>
            <p className="text-[11px] text-muted-foreground mb-3">
              Cliquez pour insérer à la position du curseur dans l'éditeur.
            </p>
            <div className="space-y-1.5">
              {VARIABLE_DEFINITIONS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => { setActiveTab("edit"); setTimeout(() => insertVariable(v.key), 50); }}
                  title={`Insère : ${v.key}`}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-all hover:border-primary/50 hover:bg-primary/10 ${
                    content.includes(v.key)
                      ? "border-primary/30 bg-primary/5 text-primary"
                      : "border-slate-700 bg-slate-900/40 text-foreground hover:text-primary"
                  }`}
                >
                  <span>{v.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-2 shrink-0 opacity-60">
                    {v.key}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
