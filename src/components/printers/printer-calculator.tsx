"use client";

import { useMemo, useState } from "react";
import {
  PRINTERS,
  RECHARGE_INTERVAL_MIN,
  isPrinterComplete,
  paybackMinutes,
  revenuNetHeure,
  type Printer,
} from "@/lib/printers";
import { Calculator, RotateCcw, Check, Sigma, AlertTriangle } from "lucide-react";

const MAX_SELECT = 4;
const eur = new Intl.NumberFormat("fr-FR");

function money(n: number): string {
  return `${eur.format(Math.round(n))} €`;
}

function formatPayback(min: number | null): string {
  if (min == null || !Number.isFinite(min)) return "—";
  const m = Math.round(min);
  if (m < 60) return `~ ${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `~ ${h}h${String(mm).padStart(2, "0")}`;
}

const rechargeLabel = `Perte totale / ${RECHARGE_INTERVAL_MIN.toLocaleString("fr-FR")} min`;
const TODO = "À renseigner";

export default function PrinterCalculator() {
  const [selected, setSelected] = useState<string[]>([]);
  const atMax = selected.length >= MAX_SELECT;

  function toggle(id: string) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_SELECT) return cur;
      return [...cur, id];
    });
  }

  const selectedPrinters = useMemo(
    () =>
      selected
        .map((id) => PRINTERS.find((p) => p.id === id))
        .filter((p): p is Printer => Boolean(p)),
    [selected]
  );

  const totals = useMemo(() => {
    const t = { cost: 0, revMin: 0, revH: 0, perte: 0, missing: [] as string[] };
    for (const p of selectedPrinters) {
      t.cost += p.cost;
      if (p.revenuNetMin != null) {
        t.revMin += p.revenuNetMin;
        t.revH += p.revenuNetMin * 60;
      }
      if (p.perteRecharge != null) t.perte += p.perteRecharge;
      if (!isPrinterComplete(p)) t.missing.push(p.name);
    }
    return t;
  }, [selectedPrinters]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-1 py-2">
      {/* ── En-tête ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(20,11,13,0.7),rgba(9,4,6,0.82))] p-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/70 to-transparent" />
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-amber-200">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-50">Calculateur Printer</h1>
            <p className="mt-1 text-sm text-slate-400">
              Sélectionne jusqu&apos;à {MAX_SELECT} modèles pour comparer revenus, coûts de recharge et temps
              de rentabilisation.
            </p>
          </div>
        </div>
      </div>

      {/* ── Sélecteur de printers ───────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Modèles · {selected.length}/{MAX_SELECT}
          </span>
          {selected.length > 0 ? (
            <button
              onClick={() => setSelected([])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.08]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Réinitialiser
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PRINTERS.map((p) => {
            const isSel = selected.includes(p.id);
            const disabled = !isSel && atMax;
            const complete = isPrinterComplete(p);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                disabled={disabled}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                  isSel
                    ? "border-amber-400/50 bg-amber-500/10 shadow-[0_0_18px_-6px_rgba(245,158,11,0.5)]"
                    : disabled
                      ? "cursor-not-allowed border-white/8 bg-white/[0.02] opacity-40"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">{p.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    {money(p.cost)}
                    {!complete ? (
                      <span className="rounded bg-amber-500/10 px-1 text-[10px] font-medium text-amber-300/80">
                        à compléter
                      </span>
                    ) : null}
                  </div>
                </div>
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                    isSel
                      ? "border-amber-400/60 bg-amber-400/20 text-amber-200"
                      : "border-white/15 text-transparent"
                  }`}
                >
                  <Check className="h-3 w-3" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Résultats ───────────────────────────────────────────── */}
      {selectedPrinters.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 px-4 py-14 text-center">
          <Calculator className="h-7 w-7 text-slate-600" />
          <p className="text-sm text-slate-500">
            Sélectionne au moins un printer ci-dessus pour voir les calculs.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {selectedPrinters.map((p) => (
              <PrinterCard key={p.id} printer={p} />
            ))}
          </div>

          {/* Totaux */}
          <div className="overflow-hidden rounded-2xl border border-amber-500/25 bg-[linear-gradient(180deg,rgba(40,28,8,0.45),rgba(20,12,4,0.5))] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sigma className="h-4 w-4 text-amber-300" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-amber-100">
                Totaux ({selectedPrinters.length} sélectionné{selectedPrinters.length > 1 ? "s" : ""})
              </h2>
            </div>
            <div className="divide-y divide-white/[0.06]">
              <Row label="Coût total net" value={money(totals.cost)} />
              <Row label="Revenu net total / min" value={money(totals.revMin)} accent="text-emerald-300" />
              <Row label="Revenu net total / h" value={money(totals.revH)} accent="text-emerald-300" />
              <Row label={`${rechargeLabel} (cumul)`} value={money(totals.perte)} accent="text-rose-300" />
            </div>
            {totals.missing.length > 0 ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/90">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Totaux incomplets : revenu non renseigné pour {totals.missing.join(", ")}.
                </span>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function PrinterCard({ printer }: { printer: Printer }) {
  const revH = revenuNetHeure(printer);
  const payback = paybackMinutes(printer);
  const complete = isPrinterComplete(printer);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(20,11,13,0.66),rgba(9,4,6,0.78))] p-5 shadow-[0_18px_48px_-30px_rgba(0,0,0,0.9)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#9b2335]/80 via-amber-500/50 to-transparent" />
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-50">{printer.name}</h3>
        {!complete ? (
          <span className="flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            données partielles
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-white/[0.06]">
        <Row label="Coût total net" value={money(printer.cost)} />
        <Row
          label="Revenu net / min"
          value={printer.revenuNetMin != null ? money(printer.revenuNetMin) : TODO}
          accent={printer.revenuNetMin != null ? "text-emerald-300" : "text-slate-500"}
        />
        <Row
          label="Revenu net / h"
          value={revH != null ? money(revH) : TODO}
          accent={revH != null ? "text-emerald-300" : "text-slate-500"}
        />
        <Row
          label={rechargeLabel}
          value={printer.perteRecharge != null ? money(printer.perteRecharge) : TODO}
          accent={printer.perteRecharge != null ? "text-rose-300" : "text-slate-500"}
        />
        <Row
          label="Temps estimé de rentabilisation"
          value={formatPayback(payback)}
          accent={payback != null ? "text-amber-200" : "text-slate-500"}
        />
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${accent ?? "text-slate-100"}`}>{value}</span>
    </div>
  );
}
