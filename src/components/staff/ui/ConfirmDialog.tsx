"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

type ConfirmDialogTone = "danger" | "warning" | "info";

const TONE_STYLES: Record<
  ConfirmDialogTone,
  { accent: string; iconWrap: string; iconColor: string; confirm: string }
> = {
  danger: {
    accent: "via-[#c42a43]/70",
    iconWrap: "border-[#c42a43]/30 bg-gradient-to-br from-[#c42a43]/15 to-[#7a1f2b]/15",
    iconColor: "text-[#ff5266] drop-shadow-[0_0_10px_rgba(196,42,67,0.55)]",
    confirm:
      "border-[#c42a43]/40 bg-gradient-to-r from-[#c42a43]/20 via-[#9b2335]/15 to-[#7a1f2b]/10 text-[#ffd2d8] hover:from-[#c42a43]/30 hover:via-[#9b2335]/22 hover:to-[#7a1f2b]/16 shadow-[0_8px_30px_-12px_rgba(196,42,67,0.65)]",
  },
  warning: {
    accent: "via-amber-500/65",
    iconWrap: "border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-700/10",
    iconColor: "text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.55)]",
    confirm:
      "border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-amber-500/12 to-amber-700/10 text-amber-100 hover:from-amber-500/30 hover:via-amber-500/18 hover:to-amber-700/14 shadow-[0_8px_30px_-12px_rgba(245,158,11,0.55)]",
  },
  info: {
    accent: "via-cyan-500/60",
    iconWrap: "border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 to-cyan-700/10",
    iconColor: "text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.45)]",
    confirm:
      "border-cyan-500/40 bg-gradient-to-r from-cyan-500/20 via-cyan-500/12 to-cyan-700/10 text-cyan-100 hover:from-cyan-500/28 hover:via-cyan-500/16 hover:to-cyan-700/12 shadow-[0_8px_30px_-12px_rgba(34,211,238,0.45)]",
  },
};

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const styles = TONE_STYLES[tone];

  // Ferme avec Escape ; valide avec Entrée si bouton focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    confirmBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-md"
      onClick={() => {
        if (!loading) onCancel();
      }}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,7,9,0.96),rgba(10,3,5,0.97))] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]"
      >
        {/* Liseré supérieur bordeaux/ambre selon la tonalité */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent ${styles.accent} to-transparent`}
        />

        {/* Bouton close en haut à droite */}
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          aria-label="Fermer"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100 disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-2 pt-7">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${styles.iconWrap}`}
            >
              <AlertTriangle className={`h-5 w-5 ${styles.iconColor}`} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2
                id="confirm-dialog-title"
                className="text-base font-semibold tracking-tight text-slate-50"
              >
                {title}
              </h2>
              {description ? (
                <div className="mt-2 text-sm leading-relaxed text-slate-300/85">
                  {description}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/8 bg-white/[0.015] px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${styles.confirm}`}
          >
            {loading ? "Patientez..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
