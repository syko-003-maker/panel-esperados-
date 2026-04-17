import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { NonLinkedCta } from "./non-linked-cta";
import DashboardClient from "./client";
import { redirect } from "next/navigation";

// ✅ MEGA PATCH #3: Ensure fresh data on every request
// This is critical for the linking flow to work - after a user links,
// we need to immediately fetch fresh scope from DB instead of using cache
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const scope = await getMemberScopeOrNull(session);

  // Non-linked member: show CTA
  if (!scope) {
    console.warn("[dashboard/page] scope null for userId:", (session as any)?.user?.id, "discordId:", (session as any)?.discordId);
    return <NonLinkedCta />;
  }

  console.log("[dashboard/page] rendering for", scope.rpName, scope.discordId);
  // Linked member: show normal dashboard
  return <DashboardClient />;
}
