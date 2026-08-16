import { requireLosEsperados } from "@/lib/guards";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { getDiscordIdFromSessionOrAccount } from "@/lib/me";
import { notFound, redirect } from "next/navigation";
import { toFamilyCuid } from "@/lib/family";

/**
 * ✅ PATCH: /staff/debug/auth - Page debug staff-only
 * Affiche session + account + member pour diagnostic liaison
 * Accessible même si non lié (sinon impossible de debug)
 * Désactivable via ENABLE_STAFF_DEBUG=0
 */
export default async function DebugAuthPage() {
  // Check if debug page is enabled
  const ENABLE_DEBUG = process.env.ENABLE_STAFF_DEBUG !== "0";
  if (!ENABLE_DEBUG) {
    notFound();
  }

  const guard = await requireLosEsperados();
  if (guard instanceof Response) {
    redirect("/api/auth/signin");
  }

  const session = await getSession();
  const userId = session?.user?.id;
  const discordId = await getDiscordIdFromSessionOrAccount(session);

  // Check Owner override
  const ownerDiscordId = process.env.OWNER_DISCORD_ID ?? "";
  const isOwner = ownerDiscordId && discordId === ownerDiscordId;

  // Check Chef famille role (DB-only, no live Discord API)
  let hasChefRole = false;
  let chefRoleCheckFailed = false;

  if (discordId && !isOwner) {
    const chefFamilleRoleId = process.env.CHEF_FAMILLE_ROLE_ID ?? "";
    if (!chefFamilleRoleId) {
      chefRoleCheckFailed = true;
    }
  }

  let member = null;
  let memberStatus = "unknown";

  if (!session) {
    memberStatus = "no-session";
  } else if (!discordId) {
    memberStatus = "no-discord-account";
  } else {
    // Convention CUID : le slug ne remontait aucun membre.
    const familyId = await toFamilyCuid("esperados");
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
        discordInGuild: true,
        discordRoleIds: true,
        discordRolesUpdatedAt: true,
        discordLastError: true,
      },
    });

    if (member && member.steamId) {
      memberStatus = "linked";
    } else if (member) {
      memberStatus = "partial-link"; // Member exists but no steamId
    } else {
      memberStatus = "unlinked";
    }
  }

  if (discordId && !isOwner && member) {
    const chefFamilleRoleId = process.env.CHEF_FAMILLE_ROLE_ID ?? "";
    const roles = Array.isArray(member.discordRoleIds) ? member.discordRoleIds : [];
    const hasDbRole = chefFamilleRoleId
      ? roles.includes(chefFamilleRoleId)
      : false;

    if (member.discordLastError || member.discordInGuild === null || member.discordInGuild === undefined) {
      chefRoleCheckFailed = true;
    } else if (member.discordInGuild === false) {
      hasChefRole = false;
    } else {
      hasChefRole = hasDbRole;
    }

    if (process.env.DEBUG_DISCORD === "1") {
      console.log("[debug-auth] DB-only role check", {
        discordId: discordId.substring(0, 6) + "...",
        inGuild: member.discordInGuild ?? null,
        rolesCount: roles.length,
        hasChefRole,
        lastError: member.discordLastError ?? null,
        updatedAt: member.discordRolesUpdatedAt ?? null,
      });
    }
  }

  // Determine staff access
  let staffAccess = "DENIED";
  let accessReason = "Unknown";

  if (isOwner && member?.steamId) {
    staffAccess = "ALLOWED";
    accessReason = "Owner override (full access)";
  } else if (hasChefRole && member?.steamId) {
    staffAccess = "ALLOWED";
    accessReason = "Chef famille role + Member linked";
  } else if (hasChefRole && !member?.steamId) {
    staffAccess = "DENIED";
    accessReason = "Chef famille role but Member not linked (steamId missing)";
  } else if (hasChefRole && !member) {
    staffAccess = "DENIED";
    accessReason = "Chef famille role but Member not found";
  } else if (chefRoleCheckFailed) {
    staffAccess = "DENIED";
    accessReason = "Chef role check failed (Discord API error)";
  } else if (!isOwner && !hasChefRole && member?.steamId) {
    staffAccess = "DENIED";
    accessReason = "Member linked but neither Owner nor Chef famille role";
  } else if (!member?.steamId) {
    staffAccess = "DENIED";
    accessReason = "Member not linked (steamId missing) → use Discord bot";
  } else {
    staffAccess = "DENIED";
    accessReason = "No authorization (Owner or Chef famille role required)";
  }

  const debugData = {
    timestamp: new Date().toISOString(),
    staffAccess,
    accessReason,
    auth: {
      discordId,
      isOwner,
      hasChefRole,
      chefRoleCheckFailed,
    },
    member: {
      status: memberStatus,
      linked: member?.steamId ? true : false,
      data: member
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
    },
    session: {
      userId,
      discordId,
      isStaff: (session as any)?.isStaff,
      isChef: (session as any)?.isChef,
    },
  };

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h1>🔍 Debug Auth</h1>
      <p>Staff access diagnostics — shows authorization status and Member linkage.</p>

      <div style={{ marginTop: 24 }}>
        <h2>
          Staff Access:{" "}
          <span style={{ color: debugData.staffAccess === "ALLOWED" ? "green" : "red" }}>
            {debugData.staffAccess}
          </span>
        </h2>
        <p>
          <strong>Reason:</strong> {debugData.accessReason}
        </p>
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: "bold" }}>Auth Details</summary>
          <ul style={{ marginTop: 8, marginLeft: 20 }}>
            <li>Discord ID: <code>{debugData.auth.discordId || "none"}</code></li>
            <li>Is Owner: {debugData.auth.isOwner ? "✅ YES" : "❌ NO"}</li>
            <li>Has Chef Famille Role: {debugData.auth.hasChefRole ? "✅ YES" : "❌ NO"}</li>
            {debugData.auth.chefRoleCheckFailed && (
              <li style={{ color: "orange" }}>⚠️ Chef role check failed (Discord API error)</li>
            )}
          </ul>
        </details>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>Member Linkage: {debugData.member.status.toUpperCase()}</h2>
        <p>
          <strong>Linked:</strong> {debugData.member.linked ? "✅ YES" : "❌ NO"}
        </p>
        {debugData.member.data && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: "bold" }}>Member Data</summary>
            <ul style={{ marginTop: 8, marginLeft: 20 }}>
              <li>ID: {debugData.member.data.id}</li>
              <li>Family ID: {debugData.member.data.familyId}</li>
              <li>Discord ID: {debugData.member.data.discordId}</li>
              <li>Steam ID: {debugData.member.data.steamId || "NOT SET"}</li>
              <li>RP Name: {debugData.member.data.rpName}</li>
              <li>Grade: {debugData.member.data.grade || "NONE"}</li>
              <li>Active: {debugData.member.data.isActive ? "✅ YES" : "❌ NO"}</li>
            </ul>
          </details>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h3>Full Debug Data</h3>
        <pre
          style={{
            background: "#f5f5f5",
            padding: 16,
            borderRadius: 4,
            overflow: "auto",
            fontSize: 12,
            fontFamily: "monospace",
          }}
        >
          {JSON.stringify(debugData, null, 2)}
        </pre>
      </div>

      <div style={{ marginTop: 24, borderTop: "1px solid #eee", paddingTop: 16 }}>
        <strong>Next Steps:</strong>
        <ul style={{ marginTop: 8 }}>
          <li>
            Utiliser le bot Discord pour lier le compte (si non lié)
          </li>
          <li>
            <a href="/staff/dashboard" style={{ textDecoration: "underline", color: "#0070f3" }}>
              Go to Staff Dashboard
            </a>
            {" "}(if authorized)
          </li>
          <li>
            <a href="/dashboard" style={{ textDecoration: "underline", color: "#0070f3" }}>
              Back to Dashboard
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

