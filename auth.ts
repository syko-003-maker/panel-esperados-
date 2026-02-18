import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import Discord from "next-auth/providers/discord";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logStaffRolesConfig } from "@/lib/discord-rbac";
import { syncDiscordRoleToPanel } from "@/lib/rbac";
import { getDiscordRolesForUser } from "@/lib/discord-roles";
import { getLinkedMemberBySession } from "@/lib/member-link";

const staffIds = (process.env.STAFF_DISCORD_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const chefIds = (process.env.CHEF_DISCORD_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Session sync cache to avoid DB queries on every request
const sessionSyncCache = new Map<string, { syncedAt: number; permissions: string[] }>();
const SESSION_SYNC_TTL = 10 * 60 * 1000; // 10 minutes

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "identify email guilds guilds.members.read",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  // ✅ Cloudflare proxy support (without trustHost for older NextAuth)
  // NEXTAUTH_URL remains the source of truth for callback/redirect base URL.
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.callback-url"
          : "next-auth.callback-url",
      options: {
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.csrf-token"
          : "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async redirect({ url, baseUrl }: any) {
      // SIMPLIFIED: NextAuth callback must not do complex logic!
      // Smart redirection logic is handled in app layouts (/me, /login, /)
      // This callback just ensures valid URLs are returned.
      
      try {
        if (url.startsWith('/')) return `${baseUrl}${url}`;
        if (new URL(url).origin === baseUrl) return url;
        return baseUrl;
      } catch (error) {
        logger.error("[auth:redirect]", "Error in redirect", error);
        return baseUrl;
      }
    },
    async session({ session, user }: any) {
      try {
        // ✅ MEGA PATCH #2: Use throttled logger
        const account = await prisma.account.findFirst({
          where: { userId: user.id, provider: "discord" },
          select: { providerAccountId: true, access_token: true },
        });

        const discordId = account?.providerAccountId ?? null;
        
        // ✅ Log throttled (dev only, max 1x/5s)
        logger.debug("auth:session", `userId: ${user.id}, discordId: ${discordId}`);

        // ✅ Exposer dans session.user ET session racine (compatibilité)
        (session as any).userId = user.id;
        (session as any).discordId = discordId;
        if (session.user) {
          (session.user as any).id = user.id;
          (session.user as any).discordId = discordId;
        }

        // ✅ LEGACY: Permissions staff/chef from allowlist
        const allowlisted = discordId ? staffIds.includes(discordId) : false;
        (session as any).isStaff = Boolean((user as any).isStaff) || allowlisted;
        (session.user as any).isStaff = (session as any).isStaff;
        
        const chefAllowlisted = discordId ? chefIds.includes(discordId) : false;
        (session as any).isChef = Boolean((user as any).isChef) || chefAllowlisted;
        (session.user as any).isChef = (session as any).isChef;

        // ✅ NEW: Sync Discord roles to RBAC DB (with caching)
        if (discordId) {
          const cacheKey = `${user.id}:${discordId}`;
          const cached = sessionSyncCache.get(cacheKey);
          const now = Date.now();

          // Only sync if cache expired (10 minutes)
          if (!cached || (now - cached.syncedAt) > SESSION_SYNC_TTL) {
            try {
              // Fetch Discord roles
              const discordRoles = await getDiscordRolesForUser(discordId);
              
              // Sync to RBAC DB (upsert StaffUser based on Discord roles)
              const staffUser = await syncDiscordRoleToPanel(discordId, discordRoles);
              
              // Cache permissions
              const permissions = staffUser?.permissions ?? [];
              sessionSyncCache.set(cacheKey, { syncedAt: now, permissions });
              
              // Expose in session
              (session as any).roles = discordRoles;
              (session as any).permissions = permissions;
              (session as any).staffRole = staffUser ? {
                code: staffUser.roleCode,
                name: staffUser.roleName,
                priority: staffUser.rolePriority,
              } : null;
              
              logger.debug("auth:session", `Synced Discord roles → RBAC for ${discordId}`);
            } catch (error) {
              // If Discord API fails, use cached permissions
              logger.warn("auth:session", `Failed to sync Discord roles: ${error}`);
              (session as any).roles = cached?.permissions ? [] : [];
              (session as any).permissions = cached?.permissions ?? [];
              (session as any).staffRole = null;
            }
          } else {
            // Use cached permissions
            (session as any).permissions = cached.permissions;
            
            // ✅ Don't fetch staffUser in callback - let guards handle staff checks
            // This prevents non-staff users from seeing confusing "Not found" logs
            (session as any).staffRole = null;
            
            logger.debug("auth:session", `Using cached permissions for ${discordId}`);
          }
        } else {
          // No Discord ID - no permissions
          (session as any).roles = [];
          (session as any).permissions = [];
          (session as any).staffRole = null;
        }

        return session;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error("auth:session", `userId=${user.id}`, err);
        throw error;
      }
    },
  },
};

// ✅ Log DATABASE configuration at startup (to detect multi-env issues)
if (process.env.NODE_ENV !== "production") {
  const dbUrl = process.env.DATABASE_URL || "";
  const dbHostMatch = dbUrl.match(/@([^/]+)/);
  const dbNameMatch = dbUrl.match(/\/([^?]+)(\?|$)/);
  const dbHost = dbHostMatch ? dbHostMatch[1] : "unknown";
  const dbName = dbNameMatch ? dbNameMatch[1] : "unknown";
  const dbUrl_masked = dbUrl.replace(/:[^@]*@/, ":***@");
  console.log("[auth:boot] DATABASE_URL", { host: dbHost, database: dbName, url: dbUrl_masked });
}

// ✅ Log RBAC staff roles configuration at startup
logStaffRolesConfig();

type NormalizedSession = Awaited<ReturnType<typeof getServerSession<typeof authOptions>>> & {
  userId?: string;
  discordId?: string | null;
  isStaff?: boolean;
  isChef?: boolean;
  roles?: string[];
  permissions?: string[];
  staffRole?: {
    code: string;
    name: string;
    priority: number;
  } | null;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    isStaff?: boolean;
    isChef?: boolean;
  };
};

function normalizeSession(session: any): NormalizedSession | null {
  if (!session) return null;
  const userId = session?.userId ?? session?.user?.id;
  if (!userId) return session as NormalizedSession;
  const user = session.user ? { ...session.user, id: userId } : { id: userId };
  return {
    ...session,
    userId,
    user,
  } as NormalizedSession;
}

export async function getSession(): Promise<NormalizedSession | null> {
  const session = await auth();
  return session;
}

export async function auth(): Promise<NormalizedSession | null> {
  const session = await getServerSession(authOptions);
  return normalizeSession(session);
}
