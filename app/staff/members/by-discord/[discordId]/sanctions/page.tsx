"use client";

import { useEffect, useState } from "react";
import { Badge } from "../../../../ui/Badge";

type SanctionEvent = {
  id: string;
  type: string;
  reason: string | null;
  status: string;
  discordStatus: string;
  discordError: string | null;
  createdAt: string;
  createdBy: string | null;
  startAt: string;
  expiresAt: string | null;
  clearedAt: string | null;
  clearedStatus: string | null;
  clearedError: string | null;
  auditEvents: Array<{ action: string; createdAt: string }>;
};

type MemberInfo = {
  id: string;
  rpName: string | null;
  discordId: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-BE");
}

function fmtDateOnly(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-BE");
}

const discordTone: Record<string, "yellow" | "green" | "red"> = {
  PENDING: "yellow",
  APPLIED: "green",
  FAILED: "red",
};

export default function MemberSanctionsPage({
  params,
}: {
  params: { discordId: string };
}) {
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [sanctions, setSanctions] = useState<SanctionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/staff/members/by-discord/${params.discordId}/sanctions`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load");
        setMember(json.member);
        setSanctions(json.sanctions ?? []);
      } catch (err: any) {
        setError(String(err?.message ?? err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.discordId]);

  if (loading)
    return (
      <div className="p-6 text-center text-gray-600">⏳ Chargement...</div>
    );

  if (error)
    return (
      <div className="p-6 border border-red-200 bg-red-50 text-red-800 rounded">
        {error}
      </div>
    );

  if (!member)
    return (
      <div className="p-6 text-center text-gray-600">Membre non trouvé</div>
    );

  // Group sanctions by date
  const groupedBySanctionDate: Record<string, SanctionEvent[]> = {};
  for (const sanction of sanctions) {
    const dateKey = fmtDateOnly(sanction.createdAt);
    if (!groupedBySanctionDate[dateKey]) {
      groupedBySanctionDate[dateKey] = [];
    }
    groupedBySanctionDate[dateKey].push(sanction);
  }

  const dateKeys = Object.keys(groupedBySanctionDate).sort().reverse();

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Historique des sanctions: {member.rpName || "Unknown"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Discord: {member.discordId} | Total: {sanctions.length}
        </p>
      </div>

      {sanctions.length === 0 ? (
        <div className="p-4 border border-slate-800 bg-slate-900/20 rounded text-foreground">
          Aucune sanction enregistrée.
        </div>
      ) : (
        <div className="space-y-8">
          {dateKeys.map((dateKey) => {
            const daySanctions = groupedBySanctionDate[dateKey];
            return (
              <div key={dateKey} className="space-y-3">
                <h2 className="text-lg font-semibold border-b border-slate-800 pb-2 text-foreground">
                  {dateKey}
                </h2>

                {daySanctions.map((sanction) => (
                  <div
                    key={sanction.id}
                    className="p-4 border border-slate-800 rounded bg-slate-900/40 space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-semibold text-gray-700">
                          Type:{" "}
                        </span>
                        <Badge tone="gray">{sanction.type}</Badge>
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">
                          Status:{" "}
                        </span>
                        <Badge tone="gray">{sanction.status}</Badge>
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">
                          Discord:{" "}
                        </span>
                        <Badge
                          tone={
                            discordTone[sanction.discordStatus] || "yellow"
                          }
                        >
                          {sanction.discordStatus}
                        </Badge>
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700">
                          Créée par:{" "}
                        </span>
                        <span className="text-gray-600">
                          {sanction.createdBy || "SYSTEM"}
                        </span>
                      </div>
                    </div>

                    {sanction.reason && (
                      <div>
                        <span className="font-semibold text-gray-700">
                          Raison:{" "}
                        </span>
                        <p className="text-gray-600">{sanction.reason}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                      <div>Date de création: {fmtDate(sanction.createdAt)}</div>
                      {sanction.expiresAt && (
                        <div>Expire: {fmtDate(sanction.expiresAt)}</div>
                      )}
                      {sanction.clearedAt && (
                        <div className="col-span-2">
                          Levée: {fmtDate(sanction.clearedAt)} (
                          {sanction.clearedStatus})
                        </div>
                      )}
                      {sanction.discordError && (
                        <div className="col-span-2 text-red-600">
                          Erreur Discord: {sanction.discordError}
                        </div>
                      )}
                    </div>

                    {sanction.auditEvents.length > 0 && (
                      <div className="pt-2 border-t text-xs text-gray-500">
                        <details>
                          <summary className="cursor-pointer font-semibold">
                            Événements ({sanction.auditEvents.length})
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {sanction.auditEvents.map((evt, i) => (
                              <li key={i}>
                                • {evt.action} @ {fmtDate(evt.createdAt)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
