import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { NonLinkedCta } from "./non-linked-cta";
import DashboardClient from "./client";

// ✅ MEGA PATCH #3: Ensure fresh data on every request
// This is critical for the linking flow to work - after a user links,
// we need to immediately fetch fresh scope from DB instead of using cache
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) {
    return null; // Layout should handle redirect
  }

  const scope = await getMemberScopeOrNull(session);

  // Non-linked member: show CTA
  if (!scope) {
    return <NonLinkedCta />;
  }

  // Linked member: show normal dashboard
  return <DashboardClient />;
}
