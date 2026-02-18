import { auth } from "@/auth";
import { getUserRole } from "@/server/auth/rbac";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import { MemberSidebar } from "./components/member-sidebar";
import { SignOutButton } from "./components/sign-out-button";
import { debug } from "@/lib/logger";

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

  // If linked: normal layout with sidebar
  return (
    <div className="flex h-screen bg-slate-950">
      <MemberSidebar isLinked={isLinked} />
      <main className="flex-1 overflow-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}
