"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ActivityMember = {
  discordId: string;
  name: string;
  role: string | null;
  isExempt: boolean;
  exemptUntil: string | null;
  exemptReason: string | null;
  playtimeMinutes: number | null;
  lastSeenAt: string | null;
  inactiveDays: number | null;
  flags: string[];
  suggestedAction: string;
  reasons: string[];
};

type ActivityResponse = {
  ok: boolean;
  familyId: string;
  lastSyncAt: string | null;
  members: ActivityMember[];
  counts: {
    total: number;
    exempt: number;
    inactive14d: number;
    lowPlaytime: number;
    recommendKick: number;
  };
  error?: string;
};

type ActivityConfig = {
  inactivityDays: number;
  lowPlaytimeMin: number;
  lowPlaytimeMax: number;
  discordAlertsEnabled: boolean;
  discordCooldownMinutes: number;
  digestEnabled: boolean;
  digestOnSync: boolean;
  digestMaxLines: number;
};

type ActivityConfigResponse = {
  ok: boolean;
  config?: ActivityConfig;
  error?: string;
};

type ActivityHistoryItem = {
  id: string;
  discordId: string;
  type: string;
  note: string | null;
  suggestedActionAtThatTime: string | null;
  flagsAtThatTime: string[];
  at: string;
  actorId: string;
  actorName: string;
};

type ActivityHistoryResponse = {
  ok: boolean;
  page: number;
  hasMore: boolean;
  items: ActivityHistoryItem[];
  error?: string;
};

const FAMILY_ID = "esperados";

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-BE");
}

function fmtMinutes(value: number | null) {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value)} min`;
}

function fmtFlags(flags: string[]) {
  return flags.length ? flags.join(", ") : "-";
}

function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function addDaysToDateInput(days: number) {
  const now = new Date();
  const next = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

function isAtRisk(member: ActivityMember) {
  return member.flags.length > 0 || member.suggestedAction !== "NONE";
}

function suggestedRank(value: string) {
  const upper = String(value || "NONE").toUpperCase();
  if (upper === "RECOMMEND_KICK") return 3;
  if (upper === "WARN_LIGHT") return 2;
  if (upper === "WARN_ORAL") return 1;
  return 0;
}

function badgeStyle(bg: string, color: string) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 6px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    background: bg,
    color,
    letterSpacing: 0.2,
  } as const;
}

export default function ActivityClient() {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const [onlyRisk, setOnlyRisk] = useState(false);
  const [search, setSearch] = useState("");

  const [configOpen, setConfigOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<ActivityConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  const [historyMember, setHistoryMember] = useState<ActivityMember | null>(null);
  const [historyItems, setHistoryItems] = useState<ActivityHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [exemptMember, setExemptMember] = useState<ActivityMember | null>(null);
  const [exemptUntil, setExemptUntil] = useState("");
  const [exemptReason, setExemptReason] = useState("");
  const [exemptSaving, setExemptSaving] = useState(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/activity?familyId=${encodeURIComponent(FAMILY_ID)}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as ActivityResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load");
      setData(json);
    } catch (err: any) {
      setError(String(err?.message ?? err));
      setData(null);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      load().catch(() => null);
    };
    const id = window.setInterval(tick, 1500);
    const onVisibility = () => {
      if (!document.hidden) load().catch(() => null);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/activity/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: FAMILY_ID }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Sync failed");
      await load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSyncing(false);
    }
  }

  async function sendDigest() {
    setDigestSending(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/activity/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: FAMILY_ID }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Digest failed");
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setDigestSending(false);
    }
  }

  async function openConfig() {
    setConfigOpen(true);
    if (configDraft) return;
    setConfigLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/activity/config?familyId=${encodeURIComponent(FAMILY_ID)}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as ActivityConfigResponse;
      if (!res.ok || !json?.ok || !json.config) {
        throw new Error(json?.error || "Config load failed");
      }
      setConfigDraft(json.config);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setConfigLoading(false);
    }
  }

  async function saveConfig() {
    if (!configDraft) return;
    setConfigSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/activity/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: FAMILY_ID, ...configDraft }),
      });
      const json = (await res.json().catch(() => ({}))) as ActivityConfigResponse;
      if (!res.ok || !json?.ok || !json.config) {
        throw new Error(json?.error || "Config save failed");
      }
      setConfigDraft(json.config);
      setConfigOpen(false);
      await load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setConfigSaving(false);
    }
  }

  function closeConfig() {
    setConfigOpen(false);
  }

  function openHistory(member: ActivityMember) {
    setHistoryMember(member);
    setHistoryItems([]);
    setHistoryPage(1);
    setHistoryHasMore(false);
    loadHistory(member, 1);
  }

  function closeHistory() {
    setHistoryMember(null);
    setHistoryItems([]);
    setHistoryPage(1);
    setHistoryHasMore(false);
  }

  async function loadHistory(member: ActivityMember, page: number) {
    setHistoryLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        familyId: FAMILY_ID,
        discordId: member.discordId,
        page: String(page),
      });
      const res = await fetch(`/api/staff/activity/actions?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as ActivityHistoryResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "History load failed");
      setHistoryItems((prev) => (page === 1 ? json.items : [...prev, ...json.items]));
      setHistoryPage(page);
      setHistoryHasMore(json.hasMore);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setHistoryLoading(false);
    }
  }

  function openExempt(member: ActivityMember) {
    setExemptMember(member);
    setExemptUntil(toDateInputValue(member.exemptUntil));
    setExemptReason(member.exemptReason ?? "");
  }

  function closeExempt() {
    setExemptMember(null);
    setExemptUntil("");
    setExemptReason("");
  }

  function applyExemptPreset(days: number, reason: string) {
    setExemptUntil(addDaysToDateInput(days));
    setExemptReason(reason);
  }

  async function saveExempt() {
    if (!exemptMember) return;
    const untilISO = exemptUntil ? new Date(exemptUntil).toISOString() : null;
    const reason = exemptReason.trim();
    if (untilISO && !reason) {
      setError("Raison obligatoire pour une exemption temporaire.");
      return;
    }

    setExemptSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/activity/exempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: FAMILY_ID,
          discordId: exemptMember.discordId,
          untilISO,
          reason,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Exemption failed");
      }
      closeExempt();
      await load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setExemptSaving(false);
    }
  }

  async function postAction(discordId: string, type: string) {
    const note = window.prompt("Note (optionnel)") ?? "";
    const res = await fetch("/api/staff/activity/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        familyId: FAMILY_ID,
        discordId,
        type,
        note,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(json?.error || "Action failed");
      return;
    }
  }

  const filteredMembers = useMemo(() => {
    const items = data?.members ?? [];
    const needle = search.trim().toLowerCase();

    const filtered = items.filter((member) => {
      if (onlyRisk && !isAtRisk(member)) return false;
      if (!needle) return true;
      return (
        member.name.toLowerCase().includes(needle) ||
        member.discordId.toLowerCase().includes(needle)
      );
    });

    return filtered.sort((a, b) => {
      const rankDiff = suggestedRank(b.suggestedAction) - suggestedRank(a.suggestedAction);
      if (rankDiff !== 0) return rankDiff;
      const playtimeDiff = (a.playtimeMinutes ?? Number.POSITIVE_INFINITY) -
        (b.playtimeMinutes ?? Number.POSITIVE_INFINITY);
      if (playtimeDiff !== 0) return playtimeDiff;
      return (b.inactiveDays ?? -1) - (a.inactiveDays ?? -1);
    });
  }, [data?.members, onlyRisk, search]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={syncNow} disabled={syncing}>
          {syncing ? "Sync..." : "Sync maintenant"}
        </button>
        <button type="button" onClick={sendDigest} disabled={digestSending}>
          {digestSending ? "Digest..." : "Envoyer digest"}
        </button>
        <button type="button" onClick={openConfig}>
          Reglages
        </button>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Rafraichir"}
        </button>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          Dernier sync: {fmtDateTime(data?.lastSyncAt ?? null)}
        </span>
      </div>

      {data?.counts ? (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, opacity: 0.8 }}>
          <div>
            Total: <b>{data.counts.total}</b>
          </div>
          <div>
            Exemptes: <b>{data.counts.exempt}</b>
          </div>
          <div>
            Inactifs: <b>{data.counts.inactive14d}</b>
          </div>
          <div>
            Playtime faible: <b>{data.counts.lowPlaytime}</b>
          </div>
          <div>
            Recommandes exclusion: <b>{data.counts.recommendKick}</b>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={onlyRisk}
            onChange={(event) => setOnlyRisk(event.target.checked)}
          />
          Seulement a risque
        </label>
        <input
          type="search"
          placeholder="Recherche nom ou discordId"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ minWidth: 220 }}
        />
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {filteredMembers.length} membre(s)
        </span>
      </div>

      {error ? (
        <div style={{ padding: 10, border: "1px solid #f2bcbc", background: "#fff5f5" }}>{error}</div>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Nom</th>
              <th align="left">Playtime</th>
              <th align="left">Derniere activite</th>
              <th align="left">Flags</th>
              <th align="left">Action suggeree</th>
              <th align="left">Exemption</th>
              <th align="left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.length ? (
              filteredMembers.map((member) => (
                <tr key={member.discordId}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{member.name}</td>
                  <td style={{ padding: 8 }}>{fmtMinutes(member.playtimeMinutes)}</td>
                  <td style={{ padding: 8 }}>
                    {fmtDateTime(member.lastSeenAt)}
                    {member.inactiveDays !== null ? ` (${member.inactiveDays}j)` : ""}
                  </td>
                  <td style={{ padding: 8 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {member.flags.includes("INACTIVE_14D") ? (
                        <span style={badgeStyle("#fee2e2", "#991b1b")}>INACTIVE</span>
                      ) : null}
                      {member.flags.includes("LOW_PLAYTIME") ? (
                        <span style={badgeStyle("#ffedd5", "#9a3412")}>LOW_PLAYTIME</span>
                      ) : null}
                      {member.isExempt ? (
                        <span style={badgeStyle("#e5e7eb", "#374151")}>EXEMPT</span>
                      ) : null}
                      {!member.flags.length && !member.isExempt ? (
                        <span style={{ fontSize: 12, opacity: 0.6 }}>{fmtFlags(member.flags)}</span>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ padding: 8 }}>
                    {member.suggestedAction === "RECOMMEND_KICK" ? (
                      <span style={badgeStyle("#fee2e2", "#991b1b")}>RECOMMEND_KICK</span>
                    ) : member.suggestedAction && member.suggestedAction !== "NONE" ? (
                      <span style={badgeStyle("#dbeafe", "#1d4ed8")}>
                        {member.suggestedAction}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={{ padding: 8 }}>
                    {member.isExempt ? "Oui" : "Non"}
                    {member.exemptUntil ? ` (${fmtDateTime(member.exemptUntil)})` : ""}
                  </td>
                  <td style={{ padding: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => openExempt(member)}>
                      Exempter
                    </button>
                    <button type="button" onClick={() => openHistory(member)}>
                      Historique
                    </button>
                    <button type="button" onClick={() => postAction(member.discordId, "WARN_ORAL")}>Avertissement oral</button>
                    <button type="button" onClick={() => postAction(member.discordId, "WARN_LIGHT")}>Avertissement leger</button>
                    <button type="button" onClick={() => postAction(member.discordId, "KICK_DONE")}>Marquer exclusion</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ padding: 8, opacity: 0.7 }}>
                  Aucun membre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {configOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 50,
          }}
        >
          <div style={{ background: "#fff", padding: 20, borderRadius: 12, minWidth: 320, maxWidth: 520, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Reglages activite</strong>
              <button type="button" onClick={closeConfig}>Fermer</button>
            </div>
            {configLoading || !configDraft ? (
              <div style={{ padding: 16, fontSize: 13 }}>Chargement...</div>
            ) : (
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  Inactivite (jours)
                  <input
                    type="range"
                    min={1}
                    max={365}
                    value={configDraft.inactivityDays}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        inactivityDays: Number(event.target.value),
                      })
                    }
                  />
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={configDraft.inactivityDays}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        inactivityDays: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  Playtime min
                  <input
                    type="number"
                    min={0}
                    value={configDraft.lowPlaytimeMin}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        lowPlaytimeMin: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  Playtime max
                  <input
                    type="number"
                    min={0}
                    value={configDraft.lowPlaytimeMax}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        lowPlaytimeMax: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  Cooldown alerts (minutes)
                  <input
                    type="number"
                    min={0}
                    value={configDraft.discordCooldownMinutes}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        discordCooldownMinutes: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  Digest max lignes
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={configDraft.digestMaxLines}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        digestMaxLines: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={configDraft.discordAlertsEnabled}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        discordAlertsEnabled: event.target.checked,
                      })
                    }
                  />
                  Alerts Discord actives
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={configDraft.digestEnabled}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        digestEnabled: event.target.checked,
                      })
                    }
                  />
                  Digest actif
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={configDraft.digestOnSync}
                    onChange={(event) =>
                      setConfigDraft({
                        ...configDraft,
                        digestOnSync: event.target.checked,
                      })
                    }
                  />
                  Digest au sync
                </label>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" onClick={closeConfig}>Annuler</button>
                  <button type="button" onClick={saveConfig} disabled={configSaving}>
                    {configSaving ? "Sauvegarde..." : "Sauvegarder"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {historyMember ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.35)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 60,
          }}
          onClick={closeHistory}
        >
          <div
            style={{
              width: 360,
              maxWidth: "90vw",
              background: "#fff",
              padding: 16,
              height: "100%",
              overflowY: "auto",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Historique - {historyMember.name}</strong>
              <button type="button" onClick={closeHistory}>Fermer</button>
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {historyLoading && historyItems.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.7 }}>Chargement...</div>
              ) : null}
              {!historyLoading && historyItems.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.7 }}>Aucune action.</div>
              ) : null}
              {historyItems.map((item) => (
                <div key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{fmtDateTime(item.at)}</div>
                  <div style={{ fontWeight: 600 }}>{item.type}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Staff: {item.actorName}</div>
                  {item.note ? <div style={{ marginTop: 6 }}>{item.note}</div> : null}
                </div>
              ))}
              {historyHasMore ? (
                <button
                  type="button"
                  onClick={() => historyMember && loadHistory(historyMember, historyPage + 1)}
                  disabled={historyLoading}
                >
                  {historyLoading ? "Chargement..." : "Charger plus"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {exemptMember ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 70,
          }}
          onClick={closeExempt}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 12,
              minWidth: 320,
              maxWidth: 520,
              width: "100%",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Exemption - {exemptMember.name}</strong>
              <button type="button" onClick={closeExempt}>Fermer</button>
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                Exempter jusqu'au (optionnel)
                <input
                  type="date"
                  value={exemptUntil}
                  onChange={(event) => setExemptUntil(event.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                Raison
                <input
                  type="text"
                  value={exemptReason}
                  onChange={(event) => setExemptReason(event.target.value)}
                  placeholder="Raison obligatoire si date"
                />
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => applyExemptPreset(7, "Vacances")}>Vacances 7j</button>
                <button type="button" onClick={() => applyExemptPreset(14, "IRL")}>IRL 14j</button>
                <button type="button" onClick={() => { setExemptUntil(""); setExemptReason(""); }}>Retirer exemption</button>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={closeExempt}>Annuler</button>
                <button type="button" onClick={saveExempt} disabled={exemptSaving}>
                  {exemptSaving ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
