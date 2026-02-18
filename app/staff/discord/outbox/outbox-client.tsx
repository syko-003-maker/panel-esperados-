"use client";

import { useEffect, useState } from "react";

type Job = {
  id: string;
  familyId: string;
  type:
    | "SEND_MESSAGE"
    | "ASSIGN_ROLE"
    | "REMOVE_ROLE"
    | "ME_ABSENCE_CREATED"
    | "ME_ABSENCE_JUSTIFIED"
    | "ME_SANCTION_JUSTIFIED"
    | "BANK_DEBT_PING_SINGLE"
    | "BANK_DEBT_PING_BATCH"
    | "ABSENCE_JUSTIFICATION_CREATED"
    | "SANCTION_JUSTIFICATION_CREATED";
  status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELED";
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  channelId: string | null;
  content: string | null;
  guildId: string | null;
  userDiscordId: string | null;
  roleId: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUSES: Job["status"][] = ["PENDING", "SENDING", "SENT", "FAILED", "CANCELED"];
const TYPES: Job["type"][] = [
  "SEND_MESSAGE",
  "ASSIGN_ROLE",
  "REMOVE_ROLE",
  "ME_ABSENCE_CREATED",
  "ME_ABSENCE_JUSTIFIED",
  "ME_SANCTION_JUSTIFIED",
  "BANK_DEBT_PING_SINGLE",
  "BANK_DEBT_PING_BATCH",
  "ABSENCE_JUSTIFICATION_CREATED",
  "SANCTION_JUSTIFICATION_CREATED",
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-BE");
}

export default function DiscordOutboxClient() {
  const [items, setItems] = useState<Job[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("familyId", "esperados");
      if (statusFilter) qs.set("status", statusFilter);
      if (typeFilter) qs.set("type", typeFilter);
      const res = await fetch(`/api/staff/discord/outbox?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load");
      setItems(json.data ?? []);
    } catch (err: any) {
      setItems([]);
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter, typeFilter]);

  async function cancelJob(id: string) {
    try {
      const res = await fetch("/api/staff/discord/outbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Cancel failed");
      await load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          Status:{" "}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          Type:{" "}
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {loading ? <span>Loading...</span> : null}
      </div>

      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Run the worker with <span style={{ fontFamily: "monospace" }}>npm run discord:worker</span>.
      </div>
      {error ? <div style={{ color: "#b42318" }}>{error}</div> : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Type</th>
              <th align="left">Status</th>
              <th align="left">Attempt</th>
              <th align="left">Next</th>
              <th align="left">Target</th>
              <th align="left">Created</th>
              <th align="left">Error</th>
              <th align="left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 8, opacity: 0.7 }}>
                  No jobs
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id}>
                  <td>{it.type}</td>
                  <td>{it.status}</td>
                  <td>
                    {it.attempt}/{it.maxAttempts}
                  </td>
                  <td>{fmtDate(it.nextAttemptAt)}</td>
                  <td>
                    {it.type === "SEND_MESSAGE"
                      ? it.channelId ?? "-"
                      : `${it.guildId ?? "-"} / ${it.userDiscordId ?? "-"} / ${it.roleId ?? "-"}`}
                  </td>
                  <td>{fmtDate(it.createdAt)}</td>
                  <td style={{ maxWidth: 240 }}>{it.lastError ?? "-"}</td>
                  <td>
                    {it.status === "PENDING" ? (
                      <button type="button" onClick={() => cancelJob(it.id)}>
                        Cancel
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
