/**
 * /api/auth/post-login
 *
 * Endpoint that returns where to redirect after NextAuth login
 * Called by layouts/pages to determine smart redirection
 *
 * Usage (from client/server components):
 * const res = await fetch('/api/auth/post-login')
 * const { redirect } = await res.json()
 * // redirect -> "/me", "/staff/dashboard", or "/login?reason=not_linked"
 *
 * Returns JSON: { redirect: string, reason: string, isStaff: boolean, isLinked: boolean }
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLinkedMemberBySession } from "@/lib/member-link";
import { canAccessStaffPanel } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();

    // No session: redirect to login
    if (!session) {
      return NextResponse.json({
        redirect: "/login",
        reason: "no_session",
        isStaff: false,
        isLinked: false,
      });
    }

    // Check if member is linked
    const member = await getLinkedMemberBySession(session);
    const isLinked = !!member;

    if (!isLinked) {
      // Not linked: show linking page
      return NextResponse.json({
        redirect: "/login?reason=not_linked",
        reason: "not_linked",
        isStaff: false,
        isLinked: false,
      });
    }

    // Member is linked: check if staff
    const staffAccess = await canAccessStaffPanel(session);
    const isStaff = staffAccess.canAccess;

    // Determine redirect
    const redirect = isStaff ? "/staff/dashboard" : "/me";

    if (process.env.NODE_ENV !== "production") {
      console.log("[api/post-login]", {
        discordId: (session as any).discordId,
        isLinked,
        isStaff,
        staffSource: staffAccess.source,
        rpName: member?.rpName,
        redirect,
      });
    }

    return NextResponse.json({
      redirect,
      reason: "success",
      isStaff,
      isLinked,
      rpName: member?.rpName,
    });
  } catch (error) {
    console.error("[api/post-login] Error:", error);
    return NextResponse.json(
      {
        redirect: "/login",
        reason: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
