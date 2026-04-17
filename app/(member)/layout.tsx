import { auth } from "@/auth";
import { getUserRole } from "@/server/auth/rbac";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import { MemberLayoutShell } from "./components/member-layout-shell";
import { debug } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { isRecruiter } from "@/lib/discord-roles";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Not authenticated: redirect to login
  if (!session) {
    redirect("/login");
  }

  // Get user role
  await getUserRole(session);

  // Check if member is linked
  // ✅ CRITICAL: Use Discord ID as source of truth (providerAccountId from OAuth Account)
  const linkedMember = await getMemberScopeOrNull(session);
  const isLinked = Boolean(linkedMember);

  // ✅ Debug logging
  if (process.env.NODE_ENV !== "production") {
    console.log("[memberLayout] MEMBER SPACE CHECK", { 
      userId: (session as any).userId,
      discordId: (session as any).discordId ?? "(not in session)",
      isLinked, 
      rpName: linkedMember?.rpName || "(none)",
      memberId: linkedMember?.memberId || "(none)",
    });
  }

  if (!isLinked) {
    debug("[memberLayout] NOT LINKED - redirecting to login", {
      userId: (session as any).userId,
      discordId: (session as any).discordId ?? null
    });
    // ✅ User has session but no Member record → truly not linked
    redirect("/login?reason=not_linked");
  }

  // Détection du rôle recruteur via le miroir Discord en DB
  let memberIsRecruiter = false;
  try {
    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    const memberRecord = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: familyDbId, discordId: linkedMember!.discordId } },
      select: { discordRoleIds: true },
    });
    if (memberRecord?.discordRoleIds) {
      memberIsRecruiter = isRecruiter(memberRecord.discordRoleIds as string[]);
    }
  } catch {
    // Non-critique : si la vérification échoue, le lien recrutement n'apparaît pas
  }

  // If linked: normal layout with sidebar
  return (
    <MemberLayoutShell isLinked={isLinked} isRecruiter={memberIsRecruiter}>
      {children}
    </MemberLayoutShell>
  );
}
