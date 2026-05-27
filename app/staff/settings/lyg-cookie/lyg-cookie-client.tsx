"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, KeyRound, ShieldCheck, Trash2, TestTube2 } from "lucide-react";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/staff/ui/use-confirm";

type State = {
  configured: boolean;
  ownerDiscordId: string | null;
  ownerName: string | null;
  expired: boolean;
  lastVerifiedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  cookieMasked: string | null;
  updatedAt: string | null;
};

type TestResult =
  | { ok: true; status: number; tookMs: number }
  | { ok: false; status: number; tookMs: number; error: string; expired: boolean }
  | null;

export default function LygCookieClient({ initialState }: { initialState: State }) {
  const [state, setState] = useState<State>(initialState);
  const [cookie, setCookie] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  async function save() {
    if (!cookie.trim()) {
      setError("Colle le cookie d'abord.");
      return;
    }
    setSaving(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/staff/settings/lyg-cookie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: cookie.trim(), test: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Échec");
      setState(json.state);
      setTestResult(json.testResult ?? null);
      setCookie(""); // on vide le textarea pour éviter qu'il traîne en clair
    } catch (err: any) {
      setError(err?.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/staff/settings/lyg-cookie", { method: "PUT" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Échec");
      setState(json.state);
      setTestResult(json.testResult ?? null);
    } catch (err: any) {
      setError(err?.message ?? "Erreur");
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Supprimer le cookie LYG ?",
      description:
        "Les actions famille en temps réel seront désactivées jusqu'à ce qu'un nouveau cookie soit fourni.",
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/staff/settings/lyg-cookie", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Échec");
      setState({
        configured: false,
        ownerDiscordId: null,
        ownerName: null,
        expired: false,
        lastVerifiedAt: null,
        lastUsedAt: null,
        lastError: null,
        cookieMasked: null,
        updatedAt: null,
      });
    } catch (err: any) {
      setError(err?.message ?? "Erreur");
    }
  }

  const statusTone: "success" | "warning" | "danger" | "neutral" = state.configured
    ? state.expired
      ? "danger"
      : "success"
    : "neutral";
  const statusLabel = state.configured
    ? state.expired
      ? "Cookie expiré"
      : "Cookie actif"
    : "Non configuré";

  return (
    <div className="grid gap-6">
      {confirmDialog}

      {/* ── État actuel ──────────────────────────────────────────── */}
      <SectionCard
        title="État du cookie"
        description="Statut courant + dernière vérification. Le cookie n'est jamais affiché en clair, juste un fingerprint partiel."
        icon={ShieldCheck}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Statut</p>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
              {state.cookieMasked ? (
                <code className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-slate-300">
                  {state.cookieMasked}
                </code>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Propriétaire</p>
            <p className="mt-1 text-sm text-slate-200">
              {state.ownerName || state.ownerDiscordId || "—"}
            </p>
            <p className="text-[10px] text-slate-500">
              Seul lui peut déclencher des actions LYG depuis le panel.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Dernier test OK</p>
            <p className="mt-1 text-sm text-slate-200">
              {state.lastVerifiedAt ? new Date(state.lastVerifiedAt).toLocaleString("fr-FR") : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Dernière utilisation</p>
            <p className="mt-1 text-sm text-slate-200">
              {state.lastUsedAt ? new Date(state.lastUsedAt).toLocaleString("fr-FR") : "—"}
            </p>
          </div>
        </div>

        {state.lastError ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            ⚠️ {state.lastError}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <MotionButtonFrame>
            <Button
              onClick={test}
              disabled={!state.configured || testing}
              variant="outline"
              size="sm"
              className="rounded-2xl border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15"
            >
              <TestTube2 className="mr-2 h-4 w-4" />
              {testing ? "Test en cours…" : "Tester maintenant"}
            </Button>
          </MotionButtonFrame>
          {state.configured ? (
            <MotionButtonFrame>
              <Button
                onClick={remove}
                variant="outline"
                size="sm"
                className="rounded-2xl border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer le cookie
              </Button>
            </MotionButtonFrame>
          ) : null}
        </div>

        {testResult ? (
          <div
            className={`mt-4 rounded-xl border p-3 text-sm ${
              testResult.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {testResult.ok ? (
              <>
                <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
                Cookie valide ({testResult.tookMs} ms)
              </>
            ) : (
              <>
                <AlertTriangle className="mr-1.5 inline h-4 w-4" />
                {testResult.error} ({testResult.status})
              </>
            )}
          </div>
        ) : null}
      </SectionCard>

      {/* ── Mise à jour ──────────────────────────────────────────── */}
      <SectionCard
        title="Coller un nouveau cookie"
        description="Comment récupérer ton PHPSESSID familles.lyg.fr et le donner au panel en toute sécurité."
        icon={KeyRound}
      >
        <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li>
            Ouvre{" "}
            <a
              href="https://families.lyg.fr/pages/dashboard.php"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 underline-offset-2 hover:underline"
            >
              families.lyg.fr/pages/dashboard.php
            </a>{" "}
            et connecte-toi via Discord.
          </li>
          <li>
            Ouvre les <strong>DevTools</strong> (touche <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px]">F12</kbd>), onglet <strong>Application → Cookies → https://families.lyg.fr</strong>.
          </li>
          <li>
            Copie la valeur de la ligne <code className="rounded bg-white/[0.04] px-1.5 py-0.5 text-xs">PHPSESSID</code>.
          </li>
          <li>Colle-la dans le champ ci-dessous et clique "Enregistrer".</li>
        </ol>

        <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Valeur PHPSESSID
        </label>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
          placeholder="ex: bcd6d5e31cf59af233e68e41b5302ef6"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500/40 focus:outline-none"
        />
        <p className="mt-2 text-[11px] text-slate-500">
          Stocké chiffré AES-256-GCM. Jamais ré-affiché en clair. Jamais loggé.
        </p>

        {error ? (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <MotionButtonFrame>
            <Button
              onClick={save}
              disabled={saving || !cookie.trim()}
              className="rounded-2xl border border-amber-500/30 bg-amber-500/15 text-amber-50 hover:bg-amber-500/25 disabled:opacity-50"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {saving ? "Enregistrement…" : "Enregistrer + tester"}
            </Button>
          </MotionButtonFrame>
        </div>
      </SectionCard>

      {/* ── Notes sécurité ───────────────────────────────────────── */}
      <SectionCard
        title="Sécurité"
        description="Ce que le panel garantit (et ne garantit pas) sur ton cookie."
      >
        <ul className="space-y-2 text-sm text-slate-300">
          <li>
            ✅ <strong>Chiffré AES-256-GCM</strong> dans la base de données. Sans la clé serveur, le cookie est illisible.
          </li>
          <li>
            ✅ <strong>Jamais loggé.</strong> Aucune trace dans les logs panel ou worker.
          </li>
          <li>
            ✅ <strong>Utilisé uniquement</strong> pour appeler families.lyg.fr/modules/edit.php sur les actions famille déclenchées par toi.
          </li>
          <li>
            ✅ <strong>Audit complet</strong> : chaque action LYG effectuée via ton cookie a une ligne dans AuditLog (qui + quand + quoi).
          </li>
          <li>
            ⚠️ <strong>Si tu te déconnectes</strong> de families.lyg.fr, ton PHPSESSID est invalidé côté serveur LYG. Le panel détectera l'expiration au prochain appel et te demandera d'en redonner un.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
