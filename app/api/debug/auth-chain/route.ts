import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { getAuthDiagnostic } from "@/lib/diagnostic-auth";
import {
  CHEF_FAMILLE_ROLE_ID,
  ETAT_MAJOR_ROLE_ID,
  RECRUTEUR_ROLE_ID,
  getDiscordRolesForUser,
  hasAnyRole,
  logDiscordRoleConfig,
} from "@/lib/discord-roles";

/**
 * GET /api/debug/auth-chain
 * 
 * Route de diagnostic pour vérifier la chaîne d'authentification complète:
 * Session → User → Account → Discord ID → Member → Discord Roles
 * 
 * Accessible uniquement en développement ou avec un flag spécial
 * 
 * Extended checks:
 * - Discord API call to verify CHEF_FAMILLE_ROLE_ID
 * - Discord member roles verification
 * - Staff role configuration validation
 */
export async function GET(req: NextRequest) {
  try {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.DEBUG_API !== "true"
    ) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    // Récupérer la session
    const session = await getSession();

    if (!session?.userId) {
      return NextResponse.json({
        error: "No session found",
        hint: "User needs to sign in first",
      }, { status: 401 });
    }

    // Exécuter le diagnostic
    const diagnostic = await getAuthDiagnostic(session.userId);

    // Extended checks for Discord roles and staff access
    logDiscordRoleConfig("debug-auth-chain");
    const staffRoleChecks = {
      chefFamilleConfigured: Boolean(CHEF_FAMILLE_ROLE_ID),
      etatMajorConfigured: Boolean(ETAT_MAJOR_ROLE_ID),
      recruteurConfigured: Boolean(RECRUTEUR_ROLE_ID),
      ownerDiscordId: process.env.OWNER_DISCORD_ID ?? "",
      discordGuildId: process.env.DISCORD_GUILD_ID ?? "",
      discordBotToken: process.env.DISCORD_BOT_TOKEN ? "✅ SET" : "❌ MISSING",
    };

    // Check Discord API access if we have a discordId
    let discordRoleCheck = {
      attempted: false,
      success: false,
      error: null as string | null,
      hasMemberInGuild: null as boolean | null,
      memberRoles: [] as string[],
      hasChefFamilleRole: null as boolean | null,
      hasEtatMajorRole: null as boolean | null,
      hasRecruteurRole: null as boolean | null,
    };

    if (diagnostic.discordId && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID) {
      discordRoleCheck.attempted = true;
      try {
        const roles = await getDiscordRolesForUser(diagnostic.discordId);
        discordRoleCheck.success = true;
        discordRoleCheck.hasMemberInGuild = true;
        discordRoleCheck.memberRoles = roles;
        discordRoleCheck.hasChefFamilleRole = hasAnyRole(roles, [CHEF_FAMILLE_ROLE_ID]);
        discordRoleCheck.hasEtatMajorRole = hasAnyRole(roles, [ETAT_MAJOR_ROLE_ID]);
        discordRoleCheck.hasRecruteurRole = hasAnyRole(roles, [RECRUTEUR_ROLE_ID]);
      } catch (err) {
        discordRoleCheck.error = err instanceof Error ? err.message : String(err);
      }
    }

    // Enrichir avec les données de session
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      session: {
        userId: session.userId,
        userName: session.user?.name,
        userEmail: session.user?.email,
        discordIdFromSession: (session as any).discordId,
        isStaff: (session as any).isStaff,
        isChef: (session as any).isChef,
      },
      diagnostic,
      staffConfiguration: staffRoleChecks,
      discordRoleVerification: discordRoleCheck,
      conclusion: {
        authChainOk: diagnostic.success,
        discordRoleCheckOk: discordRoleCheck.success,
        canAccessStaff: diagnostic.success && (
          diagnostic.discordId === staffRoleChecks.ownerDiscordId ||
          Boolean(discordRoleCheck.hasChefFamilleRole) ||
          Boolean(discordRoleCheck.hasEtatMajorRole)
        ),
        reason: diagnostic.success 
          ? (discordRoleCheck.hasChefFamilleRole ? "✅ Has CHEF_FAMILLE_ROLE_ID" :
             discordRoleCheck.hasEtatMajorRole ? "✅ Has ETAT_MAJOR_ROLE_ID" :
             diagnostic.discordId === staffRoleChecks.ownerDiscordId ? "✅ Is OWNER" :
             discordRoleCheck.attempted && !discordRoleCheck.success ? `❌ Discord API error: ${discordRoleCheck.error}` :
             "❌ No staff role found")
          : "❌ Auth chain broken - user not fully linked",
      },
    });
  } catch (error) {
    console.error("[api/debug/auth-chain] error:", error);
    return NextResponse.json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
