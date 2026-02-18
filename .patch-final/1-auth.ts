import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import Discord from "next-auth/providers/discord";
import { prisma } from "@/lib/db";

const staffIds = (process.env.STAFF_DISCORD_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const chefIds = (process.env.CHEF_DISCORD_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // ✅ PATCH: Source unique - query Discord account
      const account = await prisma.account.findFirst({
        where: { userId: user.id, provider: "discord" },
        select: { providerAccountId: true },
      });

      const discordId = account?.providerAccountId ?? null;
      
      // ✅ LOG DEBUG
      console.log("[auth:session] userId:", user.id, "discordId:", discordId);

      // ✅ Exposer dans session.user ET session racine (compatibilité)
      (session as any).userId = user.id;
      (session as any).discordId = discordId;
      if (session.user) {
        (session.user as any).id = user.id;
        (session.user as any).discordId = discordId;
      }

      // Permissions staff/chef
      const allowlisted = discordId ? staffIds.includes(discordId) : false;
      (session as any).isStaff = Boolean((user as any).isStaff) || allowlisted;
      (session.user as any).isStaff = (session as any).isStaff;
      
      const chefAllowlisted = discordId ? chefIds.includes(discordId) : false;
      (session as any).isChef = Boolean((user as any).isChef) || chefAllowlisted;
      (session.user as any).isChef = (session as any).isChef;

      return session;
    },
  },
};

type NormalizedSession = Awaited<ReturnType<typeof getServerSession<typeof authOptions>>> & {
  userId?: string;
  discordId?: string | null;
  isStaff?: boolean;
  isChef?: boolean;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    discordId?: string | null;
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
