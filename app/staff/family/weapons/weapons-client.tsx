"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import { useConfirm } from "@/components/staff/ui/use-confirm";
import {
  RefreshCw,
  Plus,
  X,
  AlertTriangle,
  Info,
  Crown,
  Swords,
  Star,
  Shield,
  ChevronDown,
  Search,
  Copy,
  Check,
} from "lucide-react";

type Weapon = { id: string; name: string; cost: number };

type WeaponsState = {
  catalog: Weapon[];
  classes: Record<string, Weapon[]>;
  totals: Record<string, number>;
  budgets: Record<string, number>;
};

type Props = {
  canManage: boolean;
  liveMode: boolean;
  cookieState: { configured: boolean; expired: boolean; ownerName: string | null };
};

const CLASS_NUMS = [1, 2, 3, 4] as const;

// Identité visuelle par classe : icône + style du badge + barre d'accent + glow.
const CLASS_BADGE: Record<
  number,
  {
    Icon: React.ComponentType<{ className?: string }>;
    cls: string;
    bar: string;
    glow: string;
  }
> = {
  1: {
    Icon: Crown,
    cls: "border-amber-400/40 bg-gradient-to-br from-amber-400/25 to-amber-600/15 text-amber-100 shadow-[0_0_16px_-4px_rgba(245,158,11,0.5)]",
    bar: "from-amber-400/90 via-amber-500/50 to-transparent",
    glow: "before:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_60%)]",
  },
  2: {
    Icon: Star,
    cls: "border-sky-400/40 bg-gradient-to-br from-sky-400/25 to-sky-600/15 text-sky-100 shadow-[0_0_16px_-4px_rgba(56,189,248,0.45)]",
    bar: "from-sky-400/90 via-sky-500/50 to-transparent",
    glow: "before:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_60%)]",
  },
  3: {
    Icon: Shield,
    cls: "border-violet-400/40 bg-gradient-to-br from-violet-400/25 to-violet-600/15 text-violet-100 shadow-[0_0_16px_-4px_rgba(167,139,250,0.45)]",
    bar: "from-violet-400/90 via-violet-500/50 to-transparent",
    glow: "before:bg-[radial-gradient(circle_at_top,rgba(167,139,250,0.12),transparent_60%)]",
  },
  4: {
    Icon: Swords,
    cls: "border-rose-400/40 bg-gradient-to-br from-rose-400/25 to-rose-600/15 text-rose-100 shadow-[0_0_16px_-4px_rgba(251,113,133,0.4)]",
    bar: "from-rose-400/90 via-rose-500/50 to-transparent",
    glow: "before:bg-[radial-gradient(circle_at_top,rgba(251,113,133,0.12),transparent_60%)]",
  },
};

// Touches de bind = noms reconnus par la console Source/GMod.
// La rangée de chiffres se binde par son CHIFFRE (1..0), pas par le symbole
// AZERTY affiché (`bind &` est refusé : « & isn't a valid key »). Sur AZERTY
// la touche "1" est physiquement celle qui montre &, donc le bind tombe au
// bon endroit.
const BIND_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

/** Construit la ligne de bind d'une arme (touche selon sa position). */
function buildBindLine(weapon: Weapon, index: number): string {
  return `bind ${BIND_KEYS[index] ?? "?"} "use ${weapon.id}"`;
}

function meterColor(total: number, budget: number): string {
  const ratio = budget > 0 ? total / budget : 0;
  if (total > budget) return "from-red-500 to-red-400";
  if (ratio >= 0.9) return "from-amber-500 to-amber-400";
  return "from-emerald-500 to-emerald-400";
}

function meterGlow(total: number, budget: number): string {
  const ratio = budget > 0 ? total / budget : 0;
  if (total > budget) return "shadow-[0_0_12px_-2px_rgba(239,68,68,0.6)]";
  if (ratio >= 0.9) return "shadow-[0_0_12px_-2px_rgba(245,158,11,0.55)]";
  return "shadow-[0_0_12px_-2px_rgba(16,185,129,0.5)]";
}

export default function WeaponsClient({ canManage, liveMode, cookieState }: Props) {
  const { confirm, dialog } = useConfirm();
  const [state, setState] = useState<WeaponsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const canAct = canManage && liveMode;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/family/weapons", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || json?.error || "Échec du chargement");
      setState({
        catalog: json.catalog ?? [],
        classes: json.classes ?? {},
        totals: json.totals ?? {},
        budgets: json.budgets ?? {},
      });
    } catch (err) {
      setError(getErrorMessage(err));
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyResult = (json: any) => {
    if (json?.catalog) {
      setState({
        catalog: json.catalog,
        classes: json.classes ?? {},
        totals: json.totals ?? {},
        budgets: json.budgets ?? {},
      });
    }
  };

  async function addWeapon(classNum: number, weaponId: string) {
    if (!weaponId || !state) return;
    const weapon = state.catalog.find((w) => w.id === weaponId);
    if (!weapon) return;

    const ok = await confirm({
      title: `Ajouter ${weapon.name} à la classe WL${classNum} ?`,
      description: (
        <span>
          Coût : <strong>{weapon.cost} pts</strong> · prélève aussi{" "}
          <strong className="text-amber-300">500 000 €</strong> de la banque famille.
        </span>
      ),
      confirmLabel: "Ajouter",
      tone: "warning",
    });
    if (!ok) return;

    setBusyKey(`add:${classNum}:${weaponId}`);
    setError(null);
    try {
      const res = await fetch("/api/staff/family/weapons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", weaponId, class: classNum }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || json?.error || "Échec de l'ajout");
      applyResult(json);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function removeWeapon(classNum: number, weapon: Weapon) {
    const ok = await confirm({
      title: `Retirer ${weapon.name} de la classe WL${classNum} ?`,
      description: "L'arme sera retirée de l'arsenal de cette classe sur LYG.",
      confirmLabel: "Retirer",
      tone: "danger",
    });
    if (!ok) return;

    setBusyKey(`rem:${classNum}:${weapon.id}`);
    setError(null);
    try {
      const res = await fetch("/api/staff/family/weapons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", weaponId: weapon.id, class: classNum }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message || json?.error || "Échec du retrait");
      applyResult(json);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyKey(null);
    }
  }

  const sortedCatalog = useMemo(
    () => (state ? [...state.catalog].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)) : []),
    [state]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-16 text-sm text-slate-400">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Chargement de l&apos;arsenal depuis LYG…
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <div className="font-semibold">Impossible de charger les armes</div>
            <div className="mt-1 text-red-200/80">{error}</div>
            {!cookieState.configured ? (
              <div className="mt-2 text-red-200/70">
                Aucun cookie LYG configuré. Va dans Paramètres → LYG pour en ajouter un.
              </div>
            ) : cookieState.expired ? (
              <div className="mt-2 text-red-200/70">Le cookie LYG est expiré — redonne-en un nouveau.</div>
            ) : null}
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
        >
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </button>
      </div>
    );
  }

  if (!state) return null;

  return (
    <div className="space-y-5">
      {dialog}

      {/* ── Actions ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2">
        <span
          className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold sm:inline-flex ${
            canAct
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-white/10 bg-white/[0.04] text-slate-400"
          }`}
        >
          {canAct ? "⚡ Mode live" : "👁 Lecture seule"}
        </span>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Rafraîchir
        </button>
      </div>

      {/* Bandeau info */}
      <div className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5 text-xs text-slate-400">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
        {canAct ? (
          <span>
            Mode live · chaque ajout d&apos;arme prélève{" "}
            <strong className="text-amber-300">500 000 €</strong> de la banque famille et applique le changement
            directement sur LYG.
          </span>
        ) : !liveMode ? (
          <span>
            Lecture seule — configure ton cookie LYG dans Paramètres → LYG (et sois Chef famille) pour modifier
            l&apos;arsenal.
          </span>
        ) : (
          <span>Lecture seule — seuls le Chef et le Sous-Chef famille peuvent modifier les armes.</span>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* ── 4 colonnes de classes ─────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 xl:grid-cols-4">
        {CLASS_NUMS.map((cls) => {
          const weapons = state.classes[String(cls)] ?? [];
          const total = state.totals[String(cls)] ?? 0;
          const budget = state.budgets[String(cls)] ?? 0;
          const remaining = budget - total;
          const pct = budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0;
          const over = total > budget;
          const assignedIds = new Set(weapons.map((w) => w.id));
          const isChef = cls === 1;

          return (
            <div
              key={cls}
              className={`group relative flex flex-col rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(20,11,13,0.66),rgba(9,4,6,0.78))] shadow-[0_20px_50px_-28px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:-translate-y-0.5 hover:border-white/15 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:content-[''] ${CLASS_BADGE[cls].glow}`}
            >
              {/* Accent bar par classe */}
              <div className={`relative z-10 h-[3px] w-full rounded-t-2xl bg-gradient-to-r ${CLASS_BADGE[cls].bar}`} />

              <div className="relative z-10 flex flex-1 flex-col p-4">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${CLASS_BADGE[cls].cls}`}
                  >
                    {(() => {
                      const BadgeIcon = CLASS_BADGE[cls].Icon;
                      return <BadgeIcon className="h-5 w-5" />;
                    })()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-slate-50">Métier n°{cls}</div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
                      Classe WL{cls}
                      {isChef ? " · Chef" : ""}
                    </div>
                  </div>
                </div>

                {/* Budget */}
                <div className="mt-4">
                  <div className="flex items-end justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      Budget
                    </span>
                    <span className={`text-xl font-bold tabular-nums ${over ? "text-red-300" : "text-slate-100"}`}>
                      {total}
                      <span className="text-sm font-medium text-slate-500"> / {budget}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-inset ring-white/5">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${meterColor(
                        total,
                        budget
                      )} ${meterGlow(total, budget)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      {weapons.length} arme{weapons.length > 1 ? "s" : ""}
                    </span>
                    <span className={over ? "font-semibold text-red-300" : "text-slate-400"}>
                      {remaining >= 0 ? `${remaining} pts libres` : `${-remaining} pts en trop`}
                    </span>
                  </div>
                </div>

                {/* Séparateur */}
                <div className="my-3 h-px w-full bg-white/[0.06]" />

                {/* Liste des armes */}
                <ul className="flex-1 space-y-1.5">
                  {weapons.length === 0 ? (
                    <li className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/10 px-3 py-8 text-center">
                      <Swords className="h-5 w-5 text-slate-600" />
                      <span className="text-xs text-slate-500">Aucune arme attribuée</span>
                    </li>
                  ) : (
                    weapons.map((w, i) => {
                      const busy = busyKey === `rem:${cls}:${w.id}`;
                      const bindKey = BIND_KEYS[i];
                      return (
                        <li
                          key={w.id}
                          className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 transition-colors hover:border-white/15 hover:bg-white/[0.05]"
                        >
                          {bindKey ? (
                            <kbd
                              title={`Bind : touche ${bindKey}`}
                              className="flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded border border-white/15 bg-white/[0.06] px-1 font-mono text-[11px] font-bold text-slate-300"
                            >
                              {bindKey}
                            </kbd>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-100" title={w.name}>
                            {w.name}
                          </span>
                          <span className="flex flex-shrink-0 items-center justify-center rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-amber-200">
                            {w.cost}
                          </span>
                          {canAct ? (
                            <button
                              onClick={() => removeWeapon(cls, w)}
                              disabled={busy}
                              title="Retirer"
                              className="flex-shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40"
                            >
                              {busy ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </li>
                      );
                    })
                  )}
                </ul>

                {/* Ajout — dropdown custom */}
                {canAct ? (
                  <div className="mt-3">
                    <WeaponPicker
                      catalog={sortedCatalog}
                      assignedIds={assignedIds}
                      remaining={remaining}
                      busy={busyKey?.startsWith(`add:${cls}:`) ?? false}
                      onPick={(weaponId) => addWeapon(cls, weaponId)}
                    />
                  </div>
                ) : null}

                {/* Binds copiables */}
                {weapons.length > 0 ? <BindsBlock weapons={weapons} /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function BindsBlock({ weapons }: { weapons: Weapon[] }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function copyLine(line: string, idx: number) {
    try {
      await navigator.clipboard.writeText(line);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch {
      /* clipboard indisponible */
    }
  }

  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
          Binds in-game
        </span>
        <span className="text-[10px] text-slate-600">· copie 1 par 1</span>
      </div>
      <ul className="space-y-1">
        {weapons.map((w, i) => {
          const line = buildBindLine(w, i);
          const copied = copiedIdx === i;
          return (
            <li
              key={w.id}
              className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/40 py-1 pl-2 pr-1"
            >
              <code
                title={line}
                className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-300"
              >
                {line}
              </code>
              <button
                onClick={() => copyLine(line, i)}
                title={copied ? "Copié !" : "Copier ce bind"}
                className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                  copied
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-white/10 bg-white/[0.05] text-slate-400 hover:bg-white/[0.12] hover:text-slate-200"
                }`}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WeaponPicker({
  catalog,
  assignedIds,
  remaining,
  busy,
  onPick,
}: {
  catalog: Weapon[];
  assignedIds: Set<string>;
  remaining: number;
  busy: boolean;
  onPick: (weaponId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? catalog.filter((w) => w.name.toLowerCase().includes(q) || String(w.cost).includes(q))
    : catalog;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex w-full items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2.5 text-sm font-medium text-emerald-100 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        <span className="flex-1 text-left">Ajouter une arme</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/12 bg-[#160c0e] shadow-[0_28px_70px_-12px_rgba(0,0,0,0.88)]">
          {/* Recherche */}
          <div className="border-b border-white/8 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une arme…"
                className="w-full rounded-lg border border-white/10 bg-black/40 py-1.5 pl-8 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
              />
            </div>
          </div>

          {/* Liste */}
          <ul className="max-h-64 space-y-0.5 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-slate-500">Aucune arme trouvée</li>
            ) : (
              filtered.map((w) => {
                const already = assignedIds.has(w.id);
                const over = w.cost > remaining;
                const disabled = already || over;
                return (
                  <li key={w.id}>
                    <button
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        onPick(w.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                        disabled
                          ? "cursor-not-allowed opacity-40"
                          : "text-slate-100 hover:bg-white/[0.07]"
                      }`}
                    >
                      <span
                        className={`flex w-7 flex-shrink-0 items-center justify-center rounded-md border px-1 py-0.5 text-[11px] font-bold tabular-nums ${
                          over
                            ? "border-red-500/30 bg-red-500/10 text-red-300"
                            : "border-amber-500/20 bg-amber-500/10 text-amber-200"
                        }`}
                      >
                        {w.cost}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{w.name}</span>
                      {already ? (
                        <span className="flex-shrink-0 text-[10px] font-semibold text-emerald-300">✓ équipée</span>
                      ) : over ? (
                        <span className="flex-shrink-0 text-[10px] text-red-300/70">trop cher</span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

