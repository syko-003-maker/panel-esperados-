import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth, getSession } from "@/auth";
import { getStaffUser } from "@/lib/rbac";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { getLinkedMemberBySession } from "@/lib/member-link";
import { prisma } from "@/lib/db";

export async function GET() {
  // ✅ Allow in production for debugging RBAC issues
  // Requires authentication to prevent info leak
  const session = await getSession();
  
  if (!session && process.env.NODE_ENV === "production") {
    return NextResponse.json({ 
      error: "Authentication required",
      hint: "This endpoint requires an active session"
    }, { status: 401 });
  }

  try {
    const h = await headers();
    const cookie = h.get("cookie");
    const cookieKeys = cookie
      ? cookie
          .split(";")
          .map((part) => part.split("=")[0]?.trim())
          .filter(Boolean)
      : [];

    // Extract key session data
    const sessionData = session ? {
      authenticated: true,
      userId: (session as any).userId ?? session.user?.id ?? null,
      discordId: (session as any).discordId ?? (session.user as any)?.discordId ?? null,
      email: session.user?.email ?? null,
      name: session.user?.name ?? null,
      legacyFlags: {
        isStaff: (session as any).isStaff ?? false,
        isChef: (session as any).isChef ?? false,
      },
      roles: (session as any).roles ?? [],
      permissions: (session as any).permissions ?? [],
      staffRole: (session as any).staffRole ?? null,
      sessionKeys: Object.keys(session),
      userKeys: session.user ? Object.keys(session.user) : [],
    } : {
      authenticated: false,
      legacyFlags: {
        isStaff: false,
        isChef: false,
      },
    };

    // Try to fetch staff user info from DB
    let staffUserInfo: any = null;
    let staffUserError: string | null = null;
    
    if (session) {
      try {
        const staffUser = await getStaffUser(session, DEFAULT_FAMILY_ID);
        if (staffUser) {
          staffUserInfo = {
            roleCode: staffUser.roleCode,
            roleName: staffUser.roleName,
            rolePriority: staffUser.rolePriority,
            permissions: staffUser.permissions,
            permissionsCount: staffUser.permissions.length,
            isActive: staffUser.isActive,
          };
        } else {
          staffUserError = "No StaffUser record found in database";
        }
      } catch (err: any) {
        staffUserError = err.message || String(err);
      }
    }
    
    // ✅ Try to fetch linked member info from DB
    let memberInfo: any = null;
    let memberError: string | null = null;
    
    if (session) {
      try {
        const member = await getLinkedMemberBySession(session);
        if (member) {
          memberInfo = {
            id: member.id,
            discordId: member.discordId,
            rpName: member.rpName,
            steamId: member.steamId,
            isActive: member.isActive,
            familyId: DEFAULT_FAMILY_ID,
          };
        } else {
          memberError = "No Member record found in database";
          
          // Extra check: does Account with Discord provider exist?
          const userId = (session as any).userId || session.user?.id;
          if (userId) {
            const account = await prisma.account.findFirst({
              where: { userId, provider: "discord" },
              select: { providerAccountId: true },
            });
            if (account?.providerAccountId) {
              memberError += ` (Discord Account found with discordId=${account.providerAccountId}, but no Member with this discordId)`;
            } else {
              memberError += " (No Discord Account found for this user)";
            }
          }
        }
      } catch (err: any) {
        memberError = err.message || String(err);
      }
    }

    // Environment info (safe subset)
    const envInfo = {
      nodeEnv: process.env.NODE_ENV,
      nextauthUrl: process.env.NEXTAUTH_URL,
      hasDiscordClientId: !!process.env.DISCORD_CLIENT_ID,
      hasDiscordSecret: !!process.env.DISCORD_CLIENT_SECRET,
      staffIdsCount: (process.env.STAFF_DISCORD_IDS ?? "").split(",").filter(Boolean).length,
      chefIdsCount: (process.env.CHEF_DISCORD_IDS ?? "").split(",").filter(Boolean).length,
      debugApiEnabled: process.env.DEBUG_API === "true",
    };

    // RBAC Decision Summary
    const legacyIsStaff = !!(sessionData as any).legacyFlags?.isStaff;
    
    const rbacDecision = session ? {
      hasSession: true,
      hasDiscordId: !!sessionData.discordId,
      hasUserId: !!sessionData.userId,
      hasStaffUserDB: !!staffUserInfo,
      hasMemberDB: !!memberInfo,
      legacyStaffFlag: legacyIsStaff,
      wouldGrantStaffAccess: !!(staffUserInfo || legacyIsStaff),
      wouldGrantMemberAccess: !!memberInfo,
      staffAccessSource: staffUserInfo ? "DB_RBAC" : legacyIsStaff ? "LEGACY_ENV" : "NONE",
      memberAccessSource: memberInfo ? "DB_MEMBER" : "NONE",
    } : {
      hasSession: false,
      hasMemberDB: false,
      wouldGrantStaffAccess: false,
      wouldGrantMemberAccess: false,
      staffAccessSource: "NO_SESSION",
      memberAccessSource: "NO_SESSION",
    };

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      cookies: {
        hasCookie: !!cookie,
        keys: cookieKeys,
        hasNextAuthSession: cookieKeys.some(k => k.includes('next-auth.session-token')),
      },
      session: sessionData,
      member: memberInfo,
      memberError,
      staffUser: staffUserInfo,
      staffUserError,
      environment: envInfo,
      rbacDecision,
    });
  } catch (error: any) {
    console.error("[/api/debug/session] Error:", error);
    return NextResponse.json({
      ok: false,
      error: "Failed to fetch session debug info",
      details: error.message || String(error),
    }, { status: 500 });
  }
}
