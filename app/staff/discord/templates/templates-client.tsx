"use client";

import { useEffect, useState, useRef } from "react";
import { Search, Copy, RotateCcw, Save, AlertCircle, Eye, FileText, Smile, Lightbulb, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge-new";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/staff/ui";
import { Separator } from "@/components/ui/separator";
import dynamic from "next/dynamic";

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

// PATCH 1: Traduction humaine des variables avec descriptions
const VARIABLE_DEFINITIONS = [
  { 
    key: "{{rpName}}", 
    label: "Nom RP du membre",
    desc: "Insère le nom de rôle-play du membre",
    fake: "Juan Morales"
  },
  { 
    key: "{{discordId}}", 
    label: "Mention Discord",
    desc: "Insère une mention Discord du membre",
    fake: "@JuanMorales"
  },
  { 
    key: "{{steamId}}", 
    label: "SteamID",
    desc: "Insère le SteamID unique du membre",
    fake: "76561198000000000"
  },
  { 
    key: "{{grade}}", 
    label: "Grade",
    desc: "Insère le grade actuel du membre",
    fake: "Soldado"
  },
  { 
    key: "{{date}}", 
    label: "Date automatique",
    desc: "Insère la date actuelle",
    fake: "12/02/2026"
  },
  { 
    key: "{{familyName}}", 
    label: "Nom de la famille",
    desc: "Insère le nom de la famille",
    fake: "Los Esperados"
  },
];

// Mapping pour backward compatibility
const AVAILABLE_VARIABLES = VARIABLE_DEFINITIONS.map(v => ({ key: v.key, desc: v.label }));

// PATCH 5: Templates exemples prédéfinis
const TEMPLATE_EXAMPLES = [
  {
    name: "Absence Approuvée",
    content: `✅ Absence validée

👤 Membre : {{rpName}}
📅 Du : {{date}}
🎖 Grade : {{grade}}`
  },
  {
    name: "Recrutement Accepté",
    content: `🎉 Recrutement accepté !

👤 Candidat : {{rpName}}
🆔 Steam : {{steamId}}
📌 Bienvenue chez {{familyName}}`
  },
  {
    name: "Sanction",
    content: `⚠️ Sanction appliquée

👤 Membre : {{rpName}}
🎖 Grade : {{grade}}
📋 Discord : {{discordId}}`
  },
  {
    name: "Rappel Dettes",
    content: `💰 Rappel de dettes

👤 {{rpName}} - {{grade}}
🏦 Vérifiez votre compte bancaire`
  }
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
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load");
      setItems(json.data ?? []);
      // Auto-select first item if none selected
      if (!selectedId && json.data && json.data.length > 0) {
        setSelectedId(json.data[0].id);
      }
    } catch (err: any) {
      setItems([]);
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredItems = items.filter((item) => {
    const matchesSearch = 
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const selectedTemplate = items.find((t) => t.id === selectedId);

  return (
    <PageShell
      title="Templates Discord"
      description="Gérer les modèles de messages Discord réutilisables"
      icon={Copy}
    >
      {/* Loading & Error States */}
      {loading && (
        <div className="text-center py-8 text-muted-foreground">
          Chargement des templates...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-max" style={{ gridTemplateRows: 'auto 1fr' }}>
          {/* Left Column: Template List (Full height) */}
          <div className="md:col-span-1 lg:col-span-1 space-y-4" style={{ gridRow: '1 / -1' }}>
            <Card className="p-4 bg-slate-900/40 border-slate-800 sticky top-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <FileText className="h-4 w-4" />
                  Templates ({filteredItems.length})
                </div>
                <Input
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border-slate-800"
                />
              </div>
            </Card>

            <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
              {filteredItems.length === 0 && (
                <Card className="p-6 bg-slate-900/20 border-slate-800 text-center">
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? "Aucun template ne correspond." : "Aucun template disponible."}
                  </p>
                </Card>
              )}
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left transition-all ${
                    selectedId === item.id
                      ? "ring-2 ring-primary"
                      : "hover:border-slate-600"
                  }`}
                >
                  <Card className={`p-3 bg-slate-900/40 border-slate-800 ${
                    selectedId === item.id ? "bg-slate-800/60" : ""
                  }`}>
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <code className="text-xs font-mono bg-slate-800 px-2 py-1 rounded truncate">
                          {item.key}
                        </code>
                        <Badge variant={item.enabled ? "default" : "outline"} className="text-xs whitespace-nowrap">
                          {item.enabled ? "✓" : "✗"}
                        </Badge>
                      </div>
                      <div className="text-sm text-foreground font-medium truncate">
                        {item.title || <span className="text-muted-foreground italic text-xs">Sans titre</span>}
                      </div>
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          </div>

          {/* Center + Right Columns: Editor & Preview */}
          <div className="md:col-span-2 lg:col-span-3">
            {selectedTemplate ? (
              <TemplateEditor key={selectedTemplate.id} item={selectedTemplate} onSaved={load} />
            ) : (
              <Card className="p-12 bg-slate-900/20 border-slate-800 text-center">
                <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Sélectionnez un template pour l'éditer
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
  const [copySuccess, setCopySuccess] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hoveredVar, setHoveredVar] = useState<string | null>(null);
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
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Save failed");
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      await onSaved();
    } catch (err: any) {
      setSaveError(String(err?.message ?? err));
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

  // PATCH 1: Insertion intelligente de variables humaines
  function insertVariable(varKey: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.substring(0, start) + varKey + content.substring(end);
    
    setContent(newContent);
    
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + varKey.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }

  // PATCH 2: Insertion emoji
  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.substring(0, start) + emoji + content.substring(end);
    
    setContent(newContent);
    setShowEmojiPicker(false);
    
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + emoji.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }

  // PATCH 5: Insérer exemple de template
  function insertExample(example: typeof TEMPLATE_EXAMPLES[0]) {
    setTitle(example.name);
    setContent(example.content);
  }

  function copyPreview() {
    const previewText = renderPreviewWithFakeData(content);
    navigator.clipboard.writeText(previewText).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }

  // PATCH 4: Remplacement FAKE pour preview
  function renderPreviewWithFakeData(text: string): string {
    let result = text;
    VARIABLE_DEFINITIONS.forEach(v => {
      result = result.replaceAll(v.key, v.fake);
    });
    return result;
  }

  const detectedVariables = VARIABLE_DEFINITIONS.filter((v) => content.includes(v.key));

  // PATCH 6: Compteur caractères
  const charCount = content.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4 bg-slate-900/40 border-slate-800">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <code className="text-sm font-mono bg-slate-800 px-2 py-1 rounded">
                {item.key}
              </code>
              <Badge variant={enabled ? "default" : "outline"}>
                {enabled ? "Activé" : "Désactivé"}
              </Badge>
              {hasChanges && (
                <Badge variant="outline" className="text-amber-400 border-amber-500/50">
                  ⚠️ Modifié
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges || saving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              size="sm"
            >
              {saving ? (
                <>Enregistrement...</>
              ) : saveSuccess ? (
                <>✓ Enregistré</>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Enregistrer
                </>
              )}
            </Button>
          </div>
        </div>
        {saveError && (
          <div className="text-sm text-red-400 flex items-start gap-2 mt-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            {saveError}
          </div>
        )}
      </Card>

      {/* 3-Column Layout: Form | Editor | Preview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: Form + Exemples */}
        <div className="md:col-span-1 space-y-4">
          <Card className="p-4 bg-slate-900/40 border-slate-800">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                  Titre
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Absence approuvée"
                  className="bg-slate-950 border-slate-800"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/20">
                <span className="text-sm font-medium text-foreground">Activé</span>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </div>
          </Card>

          {/* PATCH 5: Templates exemples */}
          <Card className="p-3 bg-slate-900/40 border-slate-800">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Zap className="h-3 w-3" />
              Exemples rapides
            </div>
            <div className="space-y-2">
              {TEMPLATE_EXAMPLES.map((ex) => (
                <button
                  key={ex.name}
                  type="button"
                  onClick={() => insertExample(ex)}
                  className="w-full text-left px-2 py-2 text-xs rounded border border-slate-700 hover:bg-slate-800/50 transition-colors"
                >
                  {ex.name}
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Center: Contenu + Variables */}
        <div className="md:col-span-1 space-y-4">
          {/* PATCH 6: Éditeur amélioré avec compteur */}
          <Card className="p-4 bg-slate-900/40 border-slate-800 flex flex-col" style={{ height: '450px' }}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Contenu du message
              </label>
              <span className="text-xs text-muted-foreground">
                {charCount} caractères
              </span>
            </div>
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="🎉 Recrutement accepté !

👤 Candidat : {{rpName}}
🆔 Steam : {{steamId}}"
              className="font-mono text-xs flex-1 p-3"
              style={{ resize: 'none' }}
            />
            {/* PATCH 6: Boutons actions */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="text-xs h-8 px-2"
              >
                <Smile className="h-3 w-3 mr-1" />
                Emoji
              </Button>
            </div>
            {showEmojiPicker && (
              <div className="mt-2 p-2 bg-slate-800 rounded border border-slate-700 max-h-32 overflow-y-auto">
                <EmojiPickerCompact onSelect={insertEmoji} />
              </div>
            )}
          </Card>

          {/* PATCH 3: Aide visuelle */}
          <Card className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex gap-2 items-start">
              <Lightbulb className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-200">
                <div className="font-semibold mb-1">💡 Astuce :</div>
                <p className="text-blue-300 leading-relaxed">
                  Vous pouvez insérer des variables dynamiques comme <code className="font-mono bg-blue-900/30 px-1 rounded text-blue-100">Nom RP</code>, <code className="font-mono bg-blue-900/30 px-1 rounded text-blue-100">Discord</code> ou <code className="font-mono bg-blue-900/30 px-1 rounded text-blue-100">Grade</code>. Elles seront remplacées automatiquement lors de l'envoi.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Variables + Preview */}
        <div className="md:col-span-1 space-y-4">
          {/* PATCH 1: Variables avec descriptions humaines */}
          <Card className="p-3 bg-slate-900/40 border-slate-800 max-h-64 overflow-y-auto">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Variables disponibles
            </div>
            <div className="space-y-2">
              {VARIABLE_DEFINITIONS.map((v) => (
                <div key={v.key} className="group">
                  <div className="text-xs font-medium text-foreground mb-1">
                    {v.label}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {v.desc}
                  </div>
                  {/* PATCH 8: Tooltip sur hover */}
                  <button
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    title={v.desc}
                    className="w-full inline-flex items-center px-2 py-1.5 text-xs font-mono bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded transition-colors"
                  >
                    {v.key}
                  </button>
                  <Separator className="my-2 bg-slate-700" />
                </div>
              ))}
            </div>
          </Card>

          {/* Preview avec fake data */}
          <Card className="p-4 bg-slate-900/40 border-slate-800 flex flex-col" style={{ height: '280px' }}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Prévisualisation
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyPreview}
                className="text-xs h-6 px-2"
              >
                {copySuccess ? "✓ Copié" : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 flex-1 overflow-y-auto space-y-2 text-xs">
              <div className="font-semibold text-foreground border-l-2 border-primary pl-2">
                {title || <span className="text-muted-foreground italic">Sans titre</span>}
              </div>
              <div className="text-slate-300 whitespace-pre-wrap break-words text-xs pl-2">
                {content ? (
                  <HighlightVariablesWithFake text={content} />
                ) : (
                  <span className="text-muted-foreground italic">(vide)</span>
                )}
              </div>
            </div>

            {/* Variables détectées */}
            {detectedVariables.length > 0 && (
              <div className="mt-2 p-2 rounded border border-slate-700 bg-slate-900/40">
                <div className="text-xs text-muted-foreground mb-1 font-semibold">
                  Variables détectées:
                </div>
                <div className="flex flex-wrap gap-1">
                  {detectedVariables.map((v) => (
                    <Badge 
                      key={v.key} 
                      variant="outline" 
                      className="text-xs font-mono cursor-help"
                      title={v.desc}
                    >
                      {v.key}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// PATCH 2: Emoji picker simplifié
function EmojiPickerCompact({ onSelect }: { onSelect: (emoji: string) => void }) {
  const commonEmojis = ["✅", "❌", "🎉", "👤", "📅", "🎖", "💰", "⚠️", "🔔", "📌"];
  
  return (
    <div className="flex flex-wrap gap-1">
      {commonEmojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="text-xl hover:scale-125 transition-transform cursor-pointer"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// PATCH 4 & PATCH 7: Preview avec fake data ET highlighting
function HighlightVariablesWithFake({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  
  return (
    <>
      {parts.map((part, i) => {
        const varDef = VARIABLE_DEFINITIONS.find(v => v.key === part);
        if (varDef) {
          return (
            <span
              key={i}
              className="bg-primary/30 text-primary px-1 rounded font-mono font-semibold"
              title={`Will be replaced with: ${varDef.fake}`}
            >
              {varDef.fake}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}function HighlightVariables({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(/^\{\{[^}]+\}\}$/)) {
          return (
            <span
              key={i}
              className="bg-primary/20 text-primary px-1 rounded font-mono font-semibold"
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
