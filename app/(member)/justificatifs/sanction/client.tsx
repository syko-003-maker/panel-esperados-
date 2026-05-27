"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  Scale,
  ShieldAlert,
  Hammer,
  Lock,
} from "lucide-react";

// Les 3 seuls types de sanction in-game que le membre peut recevoir côté
// LYG. Ils mappent directement sur ce qu'on remonte dans /staff/warns.
// L'admin LYG ne distribue pas d'autres types pour le moment.
const SANCTION_TYPES = [
  {
    value: "Warn",
    label: "Avertissement",
    short: "Warn",
    description: "Un rappel à l'ordre, pas de sanction effective",
    icon: ShieldAlert,
    tone: "amber" as const,
  },
  {
    value: "Jail",
    label: "Prison",
    short: "Jail",
    description: "Mise en prison temporaire en jeu",
    icon: Lock,
    tone: "orange" as const,
  },
  {
    value: "Ban",
    label: "Bannissement",
    short: "Ban",
    description: "Ban temporaire ou définitif du serveur",
    icon: Hammer,
    tone: "red" as const,
  },
];

type SanctionType = (typeof SANCTION_TYPES)[number]["value"];

// Classes Tailwind compilées pour chaque tone (sinon Tailwind purge).
const TONE_STYLES: Record<
  "amber" | "orange" | "red",
  { active: string; iconActive: string; iconInactive: string }
> = {
  amber: {
    active: "border-amber-500/50 bg-amber-500/15 text-amber-100",
    iconActive: "text-amber-300",
    iconInactive: "text-amber-400/60",
  },
  orange: {
    active: "border-orange-500/50 bg-orange-500/15 text-orange-100",
    iconActive: "text-orange-300",
    iconInactive: "text-orange-400/60",
  },
  red: {
    active: "border-red-500/55 bg-red-500/15 text-red-100",
    iconActive: "text-red-300",
    iconInactive: "text-red-400/60",
  },
};

export function SanctionPageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [sanctionType, setSanctionType] = useState<SanctionType | "">("");
  const [context, setContext] = useState("");
  const [reason, setReason] = useState("");

  const reasonLength = reason.trim().length;
  const isReasonValid = reasonLength >= 10;
  const canSubmit = isReasonValid && Boolean(sanctionType) && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/member/sanction/justify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // L'API accepte historiquement `sanctionId` mais on s'en sert
          // maintenant pour le TYPE (Warn / Jail / Ban). On envoie les deux
          // pour compat ascendante : ancienne logique + nouvelle.
          sanctionId: sanctionType,
          sanctionType,
          reason,
          context,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Échec de l'envoi de la justification");
      }

      setSuccess(true);
      setSanctionType("");
      setContext("");
      setReason("");
      window.setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 py-2 sm:gap-6 sm:py-4 lg:py-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300/70 sm:text-[11px]">
          Justificatifs
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
            <Scale className="h-4 w-4 text-red-400" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-50 sm:text-xl">
              Justifier une sanction
            </h1>
            <p className="text-xs text-slate-400 sm:text-sm">
              Contester ou justifier une sanction reçue auprès de l'équipe
            </p>
          </div>
        </div>
      </div>

      {/* ── Banners ──────────────────────────────────────────────────────── */}
      {success ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-5 py-4 text-emerald-300">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm font-medium">
            Justification de sanction envoyée avec succès !
          </span>
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/8 px-5 py-4 text-red-300">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm sm:space-y-6 sm:p-6"
      >
        {/* ─ Type de sanction (3 cartes cliquables) ─ */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Type de sanction reçue <span className="text-amber-400">*</span>
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SANCTION_TYPES.map((opt) => {
              const Icon = opt.icon;
              const active = sanctionType === opt.value;
              const styles = TONE_STYLES[opt.tone];
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSanctionType(opt.value)}
                  className={`flex flex-col items-start gap-2 rounded-xl border px-4 py-4 text-left transition-all ${
                    active
                      ? styles.active
                      : "border-white/8 bg-white/[0.04] text-slate-400 hover:border-white/15 hover:text-slate-200"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${active ? styles.iconActive : styles.iconInactive}`}
                  />
                  <span className="text-sm font-semibold">{opt.short}</span>
                  <span className="text-xs leading-snug opacity-75">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
          {!sanctionType ? (
            <p className="mt-2 text-xs text-slate-500">
              Choisis le type de sanction que tu as reçue.
            </p>
          ) : null}
        </div>

        {/* ─ Contexte ─ */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Contexte <span className="font-normal text-slate-500">(optionnel)</span>
          </p>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Décrivez le contexte ou les circonstances (date, lieu, personnes impliquées…)"
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 transition focus:border-[#7a1f2b]/40 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60"
          />
        </div>

        {/* ─ Justification ─ */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Justification <span className="text-amber-400">*</span>
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="Expliquez pourquoi vous contestez cette sanction ou justifiez votre action…"
            rows={4}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 transition focus:border-[#7a1f2b]/40 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60"
          />
          <p className={`text-xs ${isReasonValid ? "text-slate-500" : "text-red-400/80"}`}>
            {reasonLength}/10 caractères minimum
          </p>
        </div>

        {/* ─ Actions ─ */}
        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] sm:order-2"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-[#7a1f2b] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#9a2535] disabled:cursor-not-allowed disabled:opacity-40 sm:order-1"
          >
            {loading ? "Envoi en cours..." : "Envoyer la justification"}
          </button>
        </div>
      </form>

      {/* ── Info & warning ───────────────────────────────────────────────── */}
      <div className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
        <p className="text-xs leading-relaxed text-slate-400 sm:text-sm">
          Votre justification sera envoyée sur le canal Discord dédié et examinée
          par l'équipe administrative. Soyez honnête et constructif dans votre
          justification.
        </p>
      </div>
      <div className="flex gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4 sm:p-5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
        <p className="text-xs leading-relaxed text-amber-300/80 sm:text-sm">
          Les fausses justifications ou comportements inappropriés peuvent
          entraîner des sanctions supplémentaires.
        </p>
      </div>
    </div>
  );
}
