"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type MeetingItem = {
  id: string;
  scheduledAt: string;
  weekKey: string;
  title: string;
  type: string;
  status: string; // DRAFT | FINAL (new) or legacy statuses
  locked: boolean;
  finalizedAt: string | null;
  summary: string | null;
  decisionsCount: number;
  attendancesCount: number;
  counts: {
    total: number;
    present: number;
    late: number;
    excused: number;
    absentJustified: number;
    absentUnjustified: number;
    unknown: number;
  };
  updatedAt: string;
};

type MeetingsResponse = {
  ok: boolean;
  data: MeetingItem[];
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-BE");
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-BE");
}

export default function MeetingsClient() {
  const router = useRouter();
  const [items, setItems] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createDate, setCreateDate] = useState("");
  const loadingRef = useRef(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/meetings", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as MeetingsResponse;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Failed to load");
      setItems(json.data ?? []);
    } catch (err: any) {
      setItems([]);
      setError(String(err?.message ?? err));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      load().catch(() => null);
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  async function onCreate() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/staff/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle || undefined,
          scheduledAt: createDate || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Create failed");
      const meetingId = String(json?.meeting?.id ?? json?.meetingId ?? "");
      if (meetingId) {
        router.push(`/staff/meetings/${meetingId}`);
        return;
      }
      await load();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }

  function fmtCounts(counts: MeetingItem["counts"]) {
    if (!counts) return "—";
    return `P:${counts.present} L:${counts.late} E:${counts.excused} AJ:${counts.absentJustified} AU:${counts.absentUnjustified} U:${counts.unknown} / ${counts.total}`;
  }

  function getStatusBadge(item: MeetingItem) {
    if (item.status === "FINAL") {
      return <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>FINAL</span>;
    }
    if (item.status === "DRAFT") {
      return <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>DRAFT</span>;
    }
    // Legacy statuses
    if (item.locked) {
      return <span style={{ background: "#e0e7ff", color: "#3730a3", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>{item.status} (verrouillé)</span>;
    }
    return <span style={{ background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>{item.status}</span>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Titre (optionnel)"
          value={createTitle}
          onChange={(e) => setCreateTitle(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <input
          type="datetime-local"
          value={createDate}
          onChange={(e) => setCreateDate(e.target.value)}
        />
        <button type="button" onClick={onCreate} disabled={saving}>
          {saving ? "Creation..." : "Creer reunion semaine"}
        </button>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div style={{ padding: 10, border: "1px solid #f2bcbc", background: "#fff5f5" }}>{error}</div>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Semaine</th>
              <th align="left">Titre</th>
              <th align="left">Type</th>
              <th align="left">Date reunion</th>
              <th align="left">Etat</th>
              <th align="left">Décisions</th>
              <th align="left">Présences</th>
              <th align="left">Mis a jour</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 8, opacity: 0.7 }}>
                  Aucune reunion.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id}>
                  <td style={{ padding: 8 }}>
                    <Link href={`/staff/meetings/${it.id}`}>{it.weekKey}</Link>
                  </td>
                  <td style={{ padding: 8 }}>{it.title || "-"}</td>
                  <td style={{ padding: 8 }}>{it.type || "-"}</td>
                  <td style={{ padding: 8 }}>{fmtDate(it.scheduledAt)}</td>
                  <td style={{ padding: 8 }}>{getStatusBadge(it)}</td>
                  <td style={{ padding: 8 }}>{it.decisionsCount ?? 0}</td>
                  <td style={{ padding: 8 }}>{it.attendancesCount ?? fmtCounts(it.counts)}</td>
                  <td style={{ padding: 8 }}>{fmtDateTime(it.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
