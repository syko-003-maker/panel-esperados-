"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/staff/ui";
import { Users } from "lucide-react";

export type Link = {
  id: string;
  rpName: string;
  discordId: string | null;
  steamId: string | null;
  linkedByDiscordId?: string | null;
};

type StaffLinkFormProps = {
  initialLinks: Link[];
  prefilledDiscordId?: string;
  currentUserDiscordId?: string;
};

function normalizeRow(x: any): Link | null {
  if (!x || typeof x !== "object") return null;

  const id = typeof x.id === "string" ? x.id : String(x.id ?? "");
  const rpName = typeof x.rpName === "string" ? x.rpName : String(x.rpName ?? "");
  const discordId = x.discordId == null ? null : String(x.discordId);
  const steamId = x.steamId == null ? null : String(x.steamId);
  const linkedByDiscordId = x.linkedByDiscordId == null ? null : String(x.linkedByDiscordId);

  if (!id) return null;

  return { id, rpName, discordId, steamId, linkedByDiscordId };
}

export default function StaffLinkForm({ initialLinks, prefilledDiscordId, currentUserDiscordId }: StaffLinkFormProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [links, setLinks] = useState<Link[]>(() => initialLinks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ discordId: string; steamId: string }>({ discordId: "", steamId: "" });
  const [targetDiscordId, setTargetDiscordId] = useState<string>(prefilledDiscordId || "");

  useEffect(() => {
    // Get targetDiscordId from query param if provided (fallback to prop)
    if (prefilledDiscordId) {
      setTargetDiscordId(prefilledDiscordId);
    } else {
      const target = searchParams?.get("targetDiscordId") || "";
      setTargetDiscordId(target);
    }
  }, [searchParams, prefilledDiscordId]);

  // Determine if submit should be disabled (self-linking or missing fields)
  const isSelfLinking = !!(currentUserDiscordId && targetDiscordId && currentUserDiscordId === targetDiscordId);

  async function refresh() {
    const res = await fetch("/api/links", { cache: "no-store" });
    const data = await res.json().catch(() => []);

    if (!Array.isArray(data)) {
      setLinks([]);
      return;
    }

    const normalized = data
      .map((x) => normalizeRow(x))
      .filter(Boolean) as Link[];

    setLinks(normalized);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const form = e.currentTarget;
    const data = new FormData(form);

    const payload = {
      targetDiscordId: targetDiscordId || String(data.get("discordId") || ""),
      steamId: String(data.get("steamId") || ""),
      rpName: String(data.get("rpName") || ""),
    };

    const res = await fetch("/api/staff/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      
      // Map known error codes to friendly messages
      let friendlyError = err?.error || "Erreur";
      if (err?.error?.includes("SELF_LINKING_FORBIDDEN") || err?.code === "SELF_LINKING_FORBIDDEN") {
        friendlyError = "Vous ne pouvez pas vous lier vous-même depuis le panneau staff. Demandez à un autre staff de valider la liaison, ou utilisez la commande Discord prévue.";
      }
      
      setMsg(friendlyError);
      setLoading(false);
      return;
    }

    setMsg("OK : membre lié ✅");
    form.reset();
    await refresh();
    setLoading(false);
  }

  function startEdit(link: Link) {
    setEditingId(link.id);
    setEditValues({
      discordId: link.discordId ?? "",
      steamId: link.steamId ?? "",
    });
    setMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({ discordId: "", steamId: "" });
  }

  async function saveEdit(link: Link) {
    setLoading(true);
    setMsg(null);

    const payload: any = {};
    if (editValues.discordId !== (link.discordId ?? "")) {
      payload.discordId = editValues.discordId;
    }
    if (editValues.steamId !== (link.steamId ?? "")) {
      payload.steamId = editValues.steamId;
    }

    const res = await fetch(`/api/staff/members/by-id/${link.id}?familyId=esperados`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMsg(err?.error || "Erreur de mise à jour");
      setLoading(false);
      return;
    }

    setMsg("✅ Membre mis à jour");
    setEditingId(null);
    await refresh();
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Create Form */}
      <form onSubmit={onSubmit} className="space-y-4">
        {!targetDiscordId && (
          <div className="space-y-2">
            <label htmlFor="discordId" className="text-sm font-medium text-foreground">
              Discord ID
            </label>
            <input
              id="discordId"
              name="discordId"
              required
              className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
        
        {targetDiscordId && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <strong className="text-foreground">Liaison pour Discord ID:</strong>{" "}
            <code className="text-sm bg-slate-900/60 px-1.5 py-0.5 rounded">{targetDiscordId}</code>
          </div>
        )}

        {isSelfLinking && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="text-sm text-amber-300">
              <strong>⚠️ Attention:</strong> Vous ne pouvez pas vous lier vous-même depuis le panneau staff. 
              Demandez à un autre staff de valider la liaison, ou utilisez la commande Discord prévue.
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="steamId" className="text-sm font-medium text-foreground">
            SteamID64
          </label>
          <input
            id="steamId"
            name="steamId"
            required
            className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="rpName" className="text-sm font-medium text-foreground">
            Nom RP
          </label>
          <input
            id="rpName"
            name="rpName"
            required
            className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {targetDiscordId && (
          <input type="hidden" name="targetDiscordId" value={targetDiscordId} />
        )}

        <Button type="submit" disabled={loading || isSelfLinking} className="w-full">
          {loading ? "Envoi..." : "Lier le membre"}
        </Button>

        {msg && (
          <div className={`p-3 rounded-lg border text-sm ${
            msg.includes("✅") || msg.includes("OK")
              ? "border-green-500/20 bg-green-500/10 text-green-400"
              : "border-red-500/20 bg-red-500/10 text-red-400"
          }`}>
            {msg}
          </div>
        )}
      </form>

      {/* Existing Links */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Liens existants</h2>
        {links.length === 0 ? (
          <EmptyState
            title="Aucun lien"
            description="Aucun membre lié pour le moment"
            icon={<Users className="w-16 h-16" />}
          />
        ) : (
          <div className="space-y-3">
            {links.map((l) => (
              <div
                key={l.id}
                className="p-4 rounded-lg border border-slate-800 bg-slate-900/20"
              >
                <div className="font-semibold text-foreground mb-2">{l.rpName}</div>
                
                {editingId === l.id ? (
                  <>
                    <div className="space-y-3 mt-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">
                          Discord ID:
                        </label>
                        <input
                          type="text"
                          value={editValues.discordId}
                          onChange={(e) => setEditValues({ ...editValues, discordId: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-foreground">
                          Steam ID:
                        </label>
                        <input
                          type="text"
                          value={editValues.steamId}
                          onChange={(e) => setEditValues({ ...editValues, steamId: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button onClick={() => saveEdit(l)} disabled={loading} size="sm">
                        {loading ? "Sauvegarde..." : "Sauvegarder"}
                      </Button>
                      <Button onClick={cancelEdit} disabled={loading} variant="outline" size="sm">
                        Annuler
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div><span className="font-medium">Discord:</span> {l.discordId ?? "-"}</div>
                      <div><span className="font-medium">Steam:</span> {l.steamId ?? "-"}</div>
                    </div>
                    <Button onClick={() => startEdit(l)} variant="outline" size="sm" className="mt-3">
                      Modifier
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
