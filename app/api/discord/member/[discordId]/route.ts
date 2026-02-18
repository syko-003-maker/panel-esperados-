/**
 * GET /api/discord/member/[discordId]
 * 
 * Fetch Discord member info including roles, guild membership, and resolved grade.
 * Used to refresh member status and check if they're truly in the server.
 * 
 * Returns:
 * {
 *   ok: boolean,
 *   discordId: string,
 *   inGuild: boolean,
 *   roleIds: string[],
 *   gradeLabel: string | null,
 *   gradeRoleId: string | null,
 *   username?: string,
 *   displayName?: string,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDiscordRolesForUserWithStatus } from "@/lib/discord-roles";
import { pickGradeFromRoleIds } from "@/lib/discord/grades";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ discordId: string }> }
) {
  try {
    const { discordId } = await params;

    // Validate Discord ID (17-20 digits)
    if (!discordId || !/^\d{17,20}$/.test(discordId.trim())) {
      return NextResponse.json(
        { ok: false, error: "Invalid Discord ID format" },
        { status: 400 }
      );
    }

    // Fetch roles via REST API (not cache)
    const rolesResult = await getDiscordRolesForUserWithStatus(discordId.trim());
    const roles = rolesResult.roles || [];

    // Determine if user is in guild
    // If we get an empty array with no error, they might not be in the guild
    // If we get UNAVAILABLE error, definitely not in guild (API failed to find them)
    const inGuild = roles.length > 0 || (rolesResult.error !== "UNAVAILABLE" && rolesResult.error !== "CONFIG_MISSING");

    // Resolve grade from roles
    const gradeResult = pickGradeFromRoleIds(roles);

    return NextResponse.json({
      ok: true,
      discordId,
      inGuild,
      roleIds: roles,
      gradeLabel: gradeResult.label,
      gradeRoleId: gradeResult.id,
    });
  } catch (err) {
    console.error("[discord-member-api] Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
