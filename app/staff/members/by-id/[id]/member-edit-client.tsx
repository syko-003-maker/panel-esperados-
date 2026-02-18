"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs } from "@/components/tabs";
import TimelineClient from "./TimelineClient";

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
};

export function MemberEditClient({ member }: { member: Member }) {
  const router = useRouter();
  const [rpName, setRpName] = useState(member.rpName || "");
  const [steamIdEditor, setSteamIdEditor] = useState(member.steamId || "");
  const [steamIdError, setSteamIdError] = useState<string | null>(null);
  const [steamIdSaving, setSteamIdSaving] = useState(false);
  const [steamIdSaved, setSteamIdSaved] = useState(false);
  const [discordId, setDiscordId] = useState(member.discordId || "");
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rpName: rpName.trim(),
          discordId: discordId.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update member");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/staff/members");
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
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

  return (
    <div className="container max-w-4xl py-8">
      <Button
        variant="ghost"
        onClick={() => router.push("/staff/members")}
        className="mb-4"
      >
        ← Retour à la liste
      </Button>

      <Tabs
        defaultTabId="profile"
        tabs={[
          {
            id: "profile",
            label: "Profil",
            content: (
              <Card className="bg-slate-900/40 border border-slate-800">
                <CardHeader>
                  <CardTitle>Éditer le membre</CardTitle>
                  <CardDescription>
                    Modifier les informations de {member.rpName} (ID: {member.id})
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                  <CardContent className="space-y-4">
                    {error && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
                        <p className="font-medium">❌ {error}</p>
                      </div>
                    )}

                    {success && (
                      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-green-400">
                        <p className="font-medium">✅ Membre mis à jour avec succès! Redirection...</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label htmlFor="rpName" className="block text-sm font-medium text-foreground">
                        Nom RP <span className="text-red-500">*</span>
                      </label>
                      <Input
                        id="rpName"
                        value={rpName}
                        onChange={(e) => setRpName(e.target.value)}
                        placeholder="John Doe"
                        required
                        disabled={loading}
                        className="bg-slate-900/40 border-slate-800 text-foreground placeholder:text-muted-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="steamIdEditor" className="block text-sm font-medium text-foreground">
                        SteamID64 (Chef/État-Major)
                      </label>
                      <Input
                        id="steamIdEditor"
                        value={steamIdEditor}
                        onChange={(e) => setSteamIdEditor(e.target.value)}
                        placeholder="76561198123456789"
                        disabled={steamIdSaving}
                        className="bg-slate-900/40 border-slate-800 text-foreground placeholder:text-muted-foreground"
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Format: 17 chiffres (SteamID64)</span>
                        <span>{steamIdEditor.trim() ? "Défini" : "Manquant"}</span>
                      </div>
                      {steamIdError && (
                        <p className="text-sm text-red-400">{steamIdError}</p>
                      )}
                      {steamIdSaved && (
                        <p className="text-sm text-green-400">SteamID64 mis à jour.</p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSteamIdSave}
                        disabled={steamIdSaving}
                        className="w-full border-slate-800"
                      >
                        {steamIdSaving ? "Mise à jour..." : "Enregistrer le SteamID"}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="discordId" className="block text-sm font-medium text-foreground">
                        Discord ID (optionnel)
                      </label>
                      <Input
                        id="discordId"
                        value={discordId}
                        onChange={(e) => setDiscordId(e.target.value)}
                        placeholder="123456789012345678"
                        pattern="^[0-9]{17,20}$"
                        title="Doit être un nombre de 17 à 20 chiffres"
                        disabled={loading}
                        className="bg-slate-900/40 border-slate-800 text-foreground placeholder:text-muted-foreground"
                      />
                      <p className="text-sm text-muted-foreground">
                        Format: 17-20 chiffres
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-800 p-4 space-y-2 bg-slate-900/20">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Grade:</span>
                        <span className="font-medium">{member.grade || "N/A"}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Actif:</span>
                        <span className="font-medium">
                          {member.isActive ? "✅ Oui" : "❌ Non"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Rejoint le:</span>
                        <span className="font-medium">
                          {member.joinedAt
                            ? new Date(member.joinedAt).toLocaleDateString("fr-FR")
                            : "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Dernière MAJ:</span>
                        <span className="font-medium">
                          {new Date(member.updatedAt).toLocaleDateString("fr-FR")}
                        </span>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="flex justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/staff/members")}
                      disabled={loading}
                    >
                      Annuler
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? "Enregistrement..." : "Enregistrer"}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            ),
          },
          {
            id: "timeline",
            label: "📅 Timeline",
            content: <TimelineClient memberId={member.id} />,
          },
        ]}
      />
    </div>
  );
}
