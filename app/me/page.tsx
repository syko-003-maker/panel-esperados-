import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";

/**
 * /me - Member entry point (members only)
 * Redirects to member dashboard after checking link status
 */
export const dynamic = "force-dynamic";

export default async function MePage() {
  const session = await auth();

  // Not authenticated: redirect to login
  if (!session) {
    redirect("/login");
  }

  const linked = await getMemberScopeOrNull(session);
  
  if (!linked) {
    // Not linked: show linkage form
    redirect("/login?reason=not_linked");
  }

  // Linked: redirect to member dashboard
  redirect("/dashboard");
}
