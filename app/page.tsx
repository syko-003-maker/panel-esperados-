import { auth } from "@/auth";
import { getLinkedMemberBySession } from "@/lib/member-link";
import { canAccessStaffPanel } from "@/lib/rbac";
import { redirect } from "next/navigation";

/**
 * Root page "/" - Smart redirect after login
 * Determines WHERE to send the user based on:
 * 1. Session status (logged in or not)
 * 2. Member linking status (linked or not)
 * 3. Staff access (staff or simple member)
 *
 * Redirects to:
 * - /login (no session)
 * - /login?reason=not_linked (session but not linked)
 * - /staff/dashboard (linked + staff)
 * - /me (linked + member)
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();

  // No session: send to login
  if (!session) {
    redirect("/login");
  }

  // Check if member is linked
  const member = await getLinkedMemberBySession(session);

  if (!member) {
    // Authenticated but not linked: show link page
    redirect("/login?reason=not_linked");
  }

  // Member is linked: check if staff (full staff only — recruteur reste dans l'espace membre)
  const staffAccess = await canAccessStaffPanel(session);

  if (staffAccess.canAccess && staffAccess.staffUser?.roleCode !== "RECRUITER") {
    // Staff complet: go to staff dashboard
    redirect("/staff/dashboard");
  }

  // Membre normal ou recruteur: go to member space
  redirect("/dashboard");
}

