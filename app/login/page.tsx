import { auth } from "@/auth";
import { getUserRole } from "@/server/auth/rbac";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import LoginClient from "./login-client";
import { debug } from "@/lib/logger";
import { NonLinkedCta } from "../(member)/dashboard/non-linked-cta";

interface LoginPageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LoginPage(props: LoginPageProps) {
  const session = await auth();
  const searchParams = await props.searchParams;
  const reason = searchParams?.reason;

  // ✅ Debug log (temporary)
  if (process.env.NODE_ENV !== "production") {
    console.log("[loginPage]", { 
      hasSession: !!session, 
      reason,
      discordId: (session as any)?.discordId ?? null 
    });
  }

  // ✅ If no session, show Discord login button
  if (!session) {
    debug("[loginPage] no session: showing login page");
    return <LoginClient />;
  }

  const role = await getUserRole(session);
  debug("[loginPage] session exists", { role });

  // ✅ Staff/Chef should go to staff dashboard
  if (role === "chef" || role === "staff") {
    debug("[loginPage] redirecting to /staff/dashboard", { role });
    redirect("/staff/dashboard");
  }

  // ✅ Check if linked member
  const linked = await getMemberScopeOrNull(session);
  
  // ✅ If reason=not_linked OR member not linked: show NonLinkedCta component
  // This prevents showing Discord button again after user just logged in
  if (reason === 'not_linked' || !linked) {
    debug("[loginPage] showing NonLinkedCta", { reason, linked: !!linked });
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-950">
        {/* Background */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-slate-900 via-slate-900 to-purple-900/30" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_circle_at_20%_10%,rgba(99,102,241,0.12),transparent_50%)]" />
        
        <div className="w-full max-w-2xl">
          <NonLinkedCta />
        </div>
      </div>
    );
  }

  // ✅ Linked member: redirect to dashboard
  debug("[loginPage] linked member: redirecting to /dashboard", { rpName: linked.rpName });
  redirect("/dashboard");
}
