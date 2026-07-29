"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/staff/ui/PageShell";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { DataTile } from "@/components/staff/ui/DataTile";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { Tabs } from "@/components/tabs";
import TimelineClient from "./TimelineClient";
import { AlertCircle, ArrowLeft, Check, Gamepad2, Pencil, UserRound } from "lucide-react";

type Member = {
  id: string;
  familyId: string;
  discordId: string | null;
  steamId: string | null;
  rpName: string | null;
  grade: string | null;
  gradeLevel: number | null;
  isActive: boolean;
  joinedAt: string | null;
  updatedAt: string;
  playtimeRequiredMinutes: number | null;
};

const INPUT_CLASS =
  "h-12 rounded-xl border-white/10 bg-card/70 px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-0";

export function MemberEditClient({ member }: { member: Member }) {
  const router = useRouter();
  const [rpName, setRpName] = useState(member.rpName || "");
  const [steamIdEditor, setSteamIdEditor] = useState(member.steamId || "");
  const [steamIdError, setSteamIdError] = useState<string | null>(null);
  const [steamIdSaving, setSteamIdSaving] = useState(false);
  const [steamIdSaved, setSteamIdSaved] = useState(false);
  const [discordId, setDiscordId] = useState(member.discordId || "");
  const [playtimeReq, setPlaytimeReq] = useState(
    member.playtimeRequiredMinutes != null ? String(member.playtimeRequiredMinutes) : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/staff/members/by-id/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rpName: rpName.trim(),
          discordId: discordId.trim() || null,
          // "" → retire l'exception (défaut 300) ; sinon minutes personnalisées.
          playtimeRequiredMinutes: playtimeReq.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Échec de la mise à jour");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/staff/members");
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  async function handleSteamIdSave() {
    setSteamIdSaving(true);
    setSteamIdError(null);
    setSteamIdSaved(false);

    const value = steamIdEditor.trim();
    if (value && !/^[0-9]{17}$/.test(value)) {
      setSteamIdError("SteamID64 doit contenir exactement 17 chiffres");
      setSteamIdSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/staff/members/${member.id}/steamid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamId: value || null }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Échec de mise à jour SteamID64");
      }
      setSteamIdSaved(true);
    } catch (err) {
      setSteamIdError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSteamIdSaving(false);
    }
  }

  const profileTab = (
    <div className="grid gap-6">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>Membre mis à jour. Redirection…</p>
        </div>
      )}

      {/* Contexte (lecture seule) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DataTile label="Grade" value={member.grade || "—"} tone="info" />
        <DataTile label="Statut" value={member.isActive ? "Actif" : "Inactif"} tone={member.isActive ? "success" : "warning"} />
        <DataTile
          label="Rejoint le"
          value={member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("fr-FR") : "—"}
        />
        <DataTile label="Dernière MAJ" value={new Date(member.updatedAt).toLocaleDateString("fr-FR")} />
      </div>

      {/* Formulaire principal */}
      <SectionCard
        title="Informations"
        description="Nom RP, liaison Discord et exception de playtime en réunion."
        icon={Pencil}
        className="border-white/8 bg-[linear-gradient(180deg,hsl(var(--sunset-surface3)/0.92),hsl(var(--sunset-surface)/0.72))] shadow-[0_18px_60px_-28px_hsl(var(--sunset-surface2)/0.75)]"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="rpName" className="text-sm font-semibold text-foreground">
                Nom RP <span className="text-rose-400">*</span>
              </label>
              <Input
                id="rpName"
                value={rpName}
                onChange={(e) => setRpName(e.target.value)}
                placeholder="John Doe"
                required
                disabled={loading}
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="discordId" className="text-sm font-semibold text-foreground">
                Discord ID
              </label>
              <Input
                id="discordId"
                value={discordId}
                onChange={(e) => setDiscordId(e.target.value)}
                placeholder="123456789012345678"
                pattern="^[0-9]{17,20}$"
                title="Doit être un nombre de 17 à 20 chiffres"
                disabled={loading}
                className={INPUT_CLASS}
              />
              <p className="text-xs text-muted-foreground">Format : 17-20 chiffres.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="playtimeReq" className="text-sm font-semibold text-foreground">
              Playtime requis en réunion (min)
            </label>
            <Input
              id="playtimeReq"
              type="number"
              min={0}
              step={1}
              value={playtimeReq}
              onChange={(e) => setPlaytimeReq(e.target.value)}
              placeholder="300 (par défaut)"
              disabled={loading}
              className={`${INPUT_CLASS} sm:max-w-xs`}
            />
            <p className="text-xs text-muted-foreground">
              Exception accordée à ce membre pour être compté{" "}
              <span className="font-medium text-foreground">présent</span> en réunion.{" "}
              <span className="text-amber-300/90">Vide = seuil normal (300 min).</span>{" "}
              <span className="text-emerald-300/90">0 = exempté (aucun playtime requis).</span>
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-white/8 pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/staff/members")}
              disabled={loading}
              className="h-11 rounded-xl border-white/10 bg-white/[0.04] px-5"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-11 rounded-xl bg-gradient-to-r from-[hsl(var(--sunset-deep))] via-[#9a2535] to-amber-700 px-6 text-sm font-semibold text-white shadow-[0_14px_30px_-14px_hsl(var(--sunset-deep)/0.8)] transition-transform hover:translate-y-[-1px] hover:from-[#8a2535] hover:via-[#aa2d40] hover:to-amber-600"
            >
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </SectionCard>

      {/* SteamID (endpoint dédié) */}
      <SectionCard
        title="SteamID64"
        description="Réservé Chef / État-Major — clé de rapprochement avec le suivi LYG."
        icon={Gamepad2}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1 space-y-2">
            <Input
              id="steamIdEditor"
              value={steamIdEditor}
              onChange={(e) => setSteamIdEditor(e.target.value)}
              placeholder="76561198123456789"
              disabled={steamIdSaving}
              className={INPUT_CLASS}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Format : 17 chiffres (SteamID64)</span>
              <span className={steamIdEditor.trim() ? "text-emerald-300/80" : "text-amber-300/80"}>
                {steamIdEditor.trim() ? "Défini" : "Manquant"}
              </span>
            </div>
            {steamIdError && <p className="text-sm text-red-400">{steamIdError}</p>}
            {steamIdSaved && <p className="text-sm text-emerald-400">SteamID64 mis à jour.</p>}
          </div>
          <MotionButtonFrame>
            <Button
              type="button"
              variant="outline"
              onClick={handleSteamIdSave}
              disabled={steamIdSaving}
              className="h-12 rounded-xl border-white/10 bg-white/[0.04] px-5 sm:mt-0"
            >
              {steamIdSaving ? "Mise à jour…" : "Enregistrer le SteamID"}
            </Button>
          </MotionButtonFrame>
        </div>
      </SectionCard>
    </div>
  );

  return (
    <PageShell
      title={`Éditer — ${member.rpName ?? "Membre"}`}
      description={`Fiche membre · ID ${member.id}`}
      icon={UserRound}
      actions={
        <MotionButtonFrame>
          <Link
            href="/staff/members"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la liste
          </Link>
        </MotionButtonFrame>
      }
    >
      <Tabs
        defaultTabId="profile"
        tabs={[
          { id: "profile", label: "Profil", content: profileTab },
          { id: "timeline", label: "📅 Timeline", content: <TimelineClient memberId={member.id} /> },
        ]}
      />
    </PageShell>
  );
}
