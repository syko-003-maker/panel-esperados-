import { requirePrivileged } from "@/lib/guards";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { getDiscordIdFromSessionOrAccount } from "@/lib/me";
import { redirect } from "next/navigation";

/**
 * ✅ PATCH: /staff/debug/auth - Page debug staff-only
 * Affiche session + account + member pour diagnostic liaison
 * Accessible même si non lié (sinon impossible de debug)
 */
export default async function DebugAuthPage() {
  const guard = await requirePrivileged();
  if (guard instanceof Response) {
    redirect("/api/auth/signin");
  }

  const session = await getSession();
  const userId = session?.user?.id;
  const discordId = await getDiscordIdFromSessionOrAccount(session);

  let member = null;
  let status = "unknown";

  if (!session) {
    status = "no-session";
  } else if (!discordId) {
    status = "no-discord-account";
  } else {
    const familyId = "esperados";
    member = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId, discordId } },
      select: {
        id: true,
        familyId: true,
        discordId: true,
        steamId: true,
        rpName: true,
        age: true,
        grade: true,
        isActive: true,
      },
    });

    if (member && member.steamId) {
      status = "linked";
    } else if (member) {
      status = "partial-link"; // Member existe mais pas de steamId
    } else {
      status = "unlinked";
    }
  }

  const debugData = {
    status,
    timestamp: new Date().toISOString(),
    session: {
      userId,
      discordId,
      isStaff: (session as any)?.isStaff,
      isChef: (session as any)?.isChef,
    },
    accountDiscordId: discordId,
    member: member
      ? {
          id: member.id,
          familyId: member.familyId,
          discordId: member.discordId,
          steamId: member.steamId,
          rpName: member.rpName,
          age: member.age,
          grade: member.grade,
          isActive: member.isActive,
        }
      : null,
    reason:
      status === "no-session"
        ? "Pas de session active"
        : status === "no-discord-account"
        ? "Compte Discord non trouvé dans Account table"
        : status === "unlinked"
        ? "Member non trouvé pour ce discordId"
        : status === "partial-link"
        ? "Member trouvé mais steamId manquant"
        : status === "linked"
        ? "Member complètement lié ✅"
        : "Statut inconnu",
  };

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h1>🔍 Debug Auth</h1>
      <p style={{ color: "#666" }}>
        Page staff-only pour diagnostiquer les problèmes de liaison Discord ↔ Member.
      </p>

      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>
          Status: <span style={{ color: status === "linked" ? "green" : "orange" }}>{status}</span>
        </h2>
        <p>
          <strong>Raison:</strong> {debugData.reason}
        </p>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>Debug Data (JSON)</h3>
        <pre
          style={{
            background: "#f5f5f5",
            padding: 16,
            borderRadius: 4,
            overflow: "auto",
            fontSize: 13,
            fontFamily: "monospace",
            border: "1px solid #ddd",
          }}
        >
          {JSON.stringify(debugData, null, 2)}
        </pre>
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 16 }}>
        <a href="/staff/link" style={{ textDecoration: "underline", color: "#0070f3" }}>
          → /staff/link
        </a>
        <a href="/me" style={{ textDecoration: "underline", color: "#0070f3" }}>
          → /me
        </a>
        <a href="/staff/dashboard" style={{ textDecoration: "underline", color: "#0070f3" }}>
          → /staff/dashboard
        </a>
      </div>
    </div>
  );
}
