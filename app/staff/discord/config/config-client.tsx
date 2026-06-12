"use client";

import { getErrorMessage } from "@/lib/errors";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Banknote,
  Bell,
  CalendarOff,
  CheckCircle2,
  ChevronDown,
  MessageSquareWarning,
  RotateCcw,
  Save,
  Scale,
  ScrollText,
  Search,
  Settings,
  Shield,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageShell } from "@/components/staff/ui/PageShell";
import { SectionCard } from "@/components/staff/ui/SectionCard";

type DiscordConfig = {
  familyId: string;
  recruitmentChannelId: string | null;
  complaintsChannelId: string | null;
  complaintCategoryId: string | null;
  meetingsChannelId: string | null;
  absencesChannelId: string | null;
  sanctionsChannelId: string | null;
  logsChannelId: string | null;
  bankAlertsChannelId: string | null;
  bankDebtPingThreshold: number | null;
  bankDebtPingEnabled: boolean;
  bankDebtPingCooldownMinutes: number;
  staffRoleId: string | null;
};

type FormState = {
  recruitmentChannelId: string;
  complaintsChannelId: string;
  complaintCategoryId: string;
  meetingsChannelId: string;
  absencesChannelId: string;
  sanctionsChannelId: string;
  logsChannelId: string;
  bankAlertsChannelId: string;
  bankDebtPingThreshold: string;
  bankDebtPingEnabled: boolean;
  bankDebtPingCooldownMinutes: string;
  staffRoleId: string;
};

type Option = { id: string; name: string; group?: string | null };

function toForm(cfg: DiscordConfig): FormState {
  return {
    recruitmentChannelId: cfg.recruitmentChannelId ?? "",
    complaintsChannelId: cfg.complaintsChannelId ?? "",
    complaintCategoryId: cfg.complaintCategoryId ?? "",
    meetingsChannelId: cfg.meetingsChannelId ?? "",
    absencesChannelId: cfg.absencesChannelId ?? "",
    sanctionsChannelId: cfg.sanctionsChannelId ?? "",
    logsChannelId: cfg.logsChannelId ?? "",
    bankAlertsChannelId: cfg.bankAlertsChannelId ?? "",
    bankDebtPingThreshold: cfg.bankDebtPingThreshold ? String(cfg.bankDebtPingThreshold) : "",
    bankDebtPingEnabled: Boolean(cfg.bankDebtPingEnabled),
    bankDebtPingCooldownMinutes: String(cfg.bankDebtPingCooldownMinutes ?? 60),
    staffRoleId: cfg.staffRoleId ?? "",
  };
}

/**
 * Sélecteur avec recherche : affiche les salons/rôles PAR NOM (plus besoin de
 * coller des IDs). Un ID inconnu reste utilisable (option "ID manuel").
 */
function PickerSelect({
  value,
  onChange,
  options,
  placeholder,
  prefix = "#",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
  prefix?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Position du menu en coordonnées viewport : rendu via portal dans <body>
  // pour échapper à l'overflow-hidden des cartes et aux stacking contexts
  // créés par leurs backdrop-blur (sinon le menu passe derrière les cartes
  // voisines / se fait rogner).
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.id === value) ?? null;

  const MENU_MAX_H = 320; // recherche + liste max-h-60

  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < MENU_MAX_H + 16 && r.top > MENU_MAX_H + 16;
    setMenuPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: r.width, up });
    setQuery("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    // Un scroll/resize déplacerait le bouton sous le menu fixe → on referme.
    function onScrollOrResize(e?: Event) {
      if (e && menuRef.current?.contains(e.target as Node)) return; // scroll interne de la liste OK
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || (o.group ?? "").toLowerCase().includes(q) || o.id.includes(q)
    );
  }, [options, query]);

  const manualId = /^\d{17,20}$/.test(query.trim()) ? query.trim() : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
          open ? "border-amber-500/40 bg-[rgba(10,4,6,0.95)]" : "border-white/10 bg-[rgba(10,4,6,0.85)] hover:border-white/20"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {current ? (
          <span className="flex min-w-0 items-center gap-1.5 text-slate-100">
            <span className="text-amber-400/80">{prefix}</span>
            <span className="truncate">{current.name}</span>
            {current.group && <span className="hidden truncate text-[11px] text-slate-500 sm:inline">· {current.group}</span>}
          </span>
        ) : value ? (
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="font-mono text-xs">{value}</span>
            <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-1.5 text-[10px] text-orange-300">introuvable</span>
          </span>
        ) : (
          <span className="text-slate-500">{placeholder}</span>
        )}
        <span className="flex shrink-0 items-center gap-1">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="rounded-full p-0.5 text-slate-500 hover:bg-white/10 hover:text-slate-200"
              title="Vider"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            transform: menuPos.up ? "translateY(-100%)" : undefined,
          }}
          className="z-[200] overflow-hidden rounded-xl border border-white/15 bg-[#120608] shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
        >
          <div className="relative border-b border-white/10 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (nom ou ID)…"
              className="w-full rounded-lg bg-white/[0.04] py-1.5 pl-8 pr-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5">
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                  o.id === value ? "bg-amber-500/15 text-amber-200" : "text-slate-200 hover:bg-white/[0.06]"
                }`}
              >
                <span className="text-amber-400/70">{prefix}</span>
                <span className="truncate">{o.name}</span>
                {o.group && <span className="ml-auto shrink-0 truncate text-[10px] text-slate-500">{o.group}</span>}
              </button>
            ))}
            {manualId && !filtered.some((o) => o.id === manualId) && (
              <button
                type="button"
                onClick={() => { onChange(manualId); setOpen(false); }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-white/[0.06]"
              >
                Utiliser l&apos;ID manuel <span className="font-mono text-amber-200">{manualId}</span>
              </button>
            )}
            {filtered.length === 0 && !manualId && (
              <p className="px-2.5 py-3 text-center text-xs text-slate-500">Aucun résultat.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      {children}
      {hint && <p className="text-[11px] leading-4 text-slate-500">{hint}</p>}
    </div>
  );
}

export default function DiscordConfigClient() {
  const [originalForm, setOriginalForm] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [channels, setChannels] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [roles, setRoles] = useState<Option[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [cfgRes, metaRes] = await Promise.all([
      fetch("/api/staff/discord/config?familyId=esperados", { cache: "no-store" }),
      fetch("/api/staff/discord/guild-meta", { cache: "no-store" }),
    ]);
    const cfgJson = await cfgRes.json().catch(() => ({}));
    if (!cfgRes.ok || !cfgJson?.ok) {
      setError(cfgJson?.error || "Échec du chargement de la configuration");
      return;
    }
    const f = toForm(cfgJson.config as DiscordConfig);
    setOriginalForm(f);
    setForm(f);

    const metaJson = await metaRes.json().catch(() => ({}));
    if (metaRes.ok && metaJson?.ok) {
      setChannels(
        (metaJson.channels ?? []).map((c: any) => ({ id: c.id, name: c.name, group: c.parentName }))
      );
      setCategories((metaJson.categories ?? []).map((c: any) => ({ id: c.id, name: c.name })));
      setRoles((metaJson.roles ?? []).map((r: any) => ({ id: r.id, name: r.name })));
      setMetaError(null);
    } else {
      setMetaError(metaJson?.error || "Impossible de lister les salons du serveur");
    }
  }

  useEffect(() => { load(); }, []);

  const hasChanges = useMemo(
    () => Boolean(form && originalForm && JSON.stringify(form) !== JSON.stringify(originalForm)),
    [form, originalForm]
  );

  async function onSave() {
    if (!form) return;
    setSaving(true);
    setOkMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/staff/discord/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: "esperados", ...form }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec de la sauvegarde");
      setOkMsg("Configuration sauvegardée");
      setTimeout(() => setOkMsg(null), 3000);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <PageShell title="Configuration Discord" icon={Settings}>
        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div>{error}</div>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Chargement…</div>
        )}
      </PageShell>
    );
  }

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <PageShell
      title="Configuration Discord"
      description="Choisis les salons et rôles utilisés par le bot — directement par leur nom, plus besoin de coller des IDs."
      icon={Settings}
    >
      <div className="space-y-6 pb-24">
        {metaError && (
          <div className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>Liste des salons indisponible ({metaError}) — tu peux quand même saisir un ID dans la recherche.</div>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Recrutement" description="Annonces et tickets de candidature" icon={Users}>
            <Field label="Salon recrutement" hint="Où les candidatures sont postées.">
              <PickerSelect value={form.recruitmentChannelId} onChange={(v) => set({ recruitmentChannelId: v })} options={channels} placeholder="Choisir un salon…" />
            </Field>
          </SectionCard>

          <SectionCard title="Plaintes" description="Tickets de plainte" icon={MessageSquareWarning}>
            <div className="grid gap-4">
              <Field label="Salon plaintes" hint="Où les plaintes arrivent.">
                <PickerSelect value={form.complaintsChannelId} onChange={(v) => set({ complaintsChannelId: v })} options={channels} placeholder="Choisir un salon…" />
              </Field>
              <Field label="Catégorie des tickets" hint="Catégorie Discord où les threads de plainte sont rangés.">
                <PickerSelect value={form.complaintCategoryId} onChange={(v) => set({ complaintCategoryId: v })} options={categories} placeholder="Choisir une catégorie…" prefix="📁" />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Réunions" description="Annonces de réunion" icon={CalendarOff}>
            <Field label="Salon réunions">
              <PickerSelect value={form.meetingsChannelId} onChange={(v) => set({ meetingsChannelId: v })} options={channels} placeholder="Choisir un salon…" />
            </Field>
          </SectionCard>

          <SectionCard title="Sanctions & absences" description="Notifications automatiques" icon={Scale}>
            <div className="grid gap-4">
              <Field label="Salon sanctions" hint="Annonces de sanction + justificatifs des membres.">
                <PickerSelect value={form.sanctionsChannelId} onChange={(v) => set({ sanctionsChannelId: v })} options={channels} placeholder="Choisir un salon…" />
              </Field>
              <Field label="Salon absences" hint="Justificatifs d'absence + décisions.">
                <PickerSelect value={form.absencesChannelId} onChange={(v) => set({ absencesChannelId: v })} options={channels} placeholder="Choisir un salon…" />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Logs" description="Traçabilité du bot" icon={ScrollText}>
            <Field label="Salon logs (optionnel)" hint="Logs des tickets et événements internes.">
              <PickerSelect value={form.logsChannelId} onChange={(v) => set({ logsChannelId: v })} options={channels} placeholder="Choisir un salon…" />
            </Field>
          </SectionCard>

          <SectionCard title="Rôles" description="Identification du staff" icon={Shield}>
            <Field label="Rôle staff (optionnel)">
              <PickerSelect value={form.staffRoleId} onChange={(v) => set({ staffRoleId: v })} options={roles} placeholder="Choisir un rôle…" prefix="@" />
            </Field>
          </SectionCard>
        </div>

        <SectionCard title="Banque & rappels de dettes" description="Alertes automatiques pour les membres en déficit" icon={Banknote}>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Salon alertes banque">
              <PickerSelect value={form.bankAlertsChannelId} onChange={(v) => set({ bankAlertsChannelId: v })} options={channels} placeholder="Choisir un salon…" />
            </Field>
            <Field label="Seuil de rappel (€)" hint="Déficit minimum pour déclencher un rappel.">
              <input
                type="number"
                value={form.bankDebtPingThreshold}
                onChange={(e) => set({ bankDebtPingThreshold: e.target.value })}
                placeholder="Ex. 50000"
                className="w-full rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
              />
            </Field>
            <Field label="Cooldown (minutes)" hint="Délai minimum entre deux rappels au même membre.">
              <input
                type="number"
                value={form.bankDebtPingCooldownMinutes}
                onChange={(e) => set({ bankDebtPingCooldownMinutes: e.target.value })}
                placeholder="60"
                className="w-full rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
              />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="flex items-center gap-3">
              <Bell className="h-4 w-4 text-amber-300" />
              <div>
                <div className="text-sm font-medium text-slate-100">Rappels automatiques activés</div>
                <p className="mt-0.5 text-xs text-slate-500">Ping Discord automatique des membres endettés au-delà du seuil.</p>
              </div>
            </div>
            <Switch
              checked={form.bankDebtPingEnabled}
              onCheckedChange={(checked) => set({ bankDebtPingEnabled: checked })}
            />
          </div>
        </SectionCard>
      </div>

      {/* Barre de sauvegarde sticky */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0d0507]/95 backdrop-blur lg:left-[260px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="text-sm">
            {okMsg ? (
              <span className="flex items-center gap-1.5 text-emerald-300"><CheckCircle2 className="h-4 w-4" />{okMsg}</span>
            ) : hasChanges ? (
              <span className="text-amber-300">● Modifications non sauvegardées</span>
            ) : (
              <span className="text-slate-500">Configuration à jour</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setForm(originalForm); setError(null); }} disabled={!hasChanges || saving} className="rounded-2xl border-white/10 bg-white/[0.04]">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Annuler
            </Button>
            <Button type="button" size="sm" onClick={onSave} disabled={!hasChanges || saving} className="rounded-2xl">
              <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Enregistrement…" : "Sauvegarder"}
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
