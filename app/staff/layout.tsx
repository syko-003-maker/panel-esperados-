import { auth } from "@/auth";
import { StaffLayout } from "@/components/staff-layout";
import { MemberLayoutShell } from "../(member)/components/member-layout-shell";
import { redirect } from "next/navigation";
import { ErrorScreen } from "@/components/error-screen";
import { canAccessStaffPanel } from "@/lib/rbac";
import { prisma } from "@/lib/db";

function AppBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
    </div>
  );
}

/**
 * ✅ Layout staff - SÉCURISÉ
 * ✅ Vérifie staff/recruteur AVANT de rendre le layout
 * ✅ Si non autorisé: rend "Accès refusé"
 * ✅ Si recruteur: layout avec navigation limitée
 * ✅ Si chef/état-major: layout complet
 * 
 * ✅ UNIFIED ACCESS: Check DB + Discord roles + legacy session
 */
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.THEME_DEBUG_BYPASS === "1" && process.env.NODE_ENV !== "production") {
    return (
      <div className="relative min-h-screen">
        <AppBackground />
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-black shadow-lg">
          BYPASS MODE
        </div>
        <StaffLayout accessLevel="full">{children}</StaffLayout>
      </div>
    );
  }

  const session = await auth();

  // Not authenticated: redirect to login
  if (!session) {
    redirect("/login");
  }

  // ✅ UNIFIED ACCESS CHECK: DB + Discord + Legacy
  let accessCheck: any;
  let fetchError = null;

  try {
    accessCheck = await canAccessStaffPanel(session);
  } catch (error: any) {
    console.error("[staff/layout] Failed to check staff access:", error);
    fetchError = error.message || "Database connection error";
    accessCheck = { canAccess: false, source: "NONE", staffUser: null };
  }

  // ✅ Show error state if fetch failed (don't assume forbidden)
  if (fetchError) {
    return (
      <ErrorScreen
        code="Vérification impossible"
        title="Erreur de connexion"
        description="Impossible de vérifier tes permissions pour le moment. Si ton compte Discord n'est pas lié, lie-le ; sinon réessaie dans quelques instants."
        tone="warning"
        actions={[
          { label: "Réessayer", href: "/staff/dashboard", variant: "primary" },
          { label: "Lier mon compte", href: "/dashboard", variant: "secondary" },
        ]}
      />
    );
  }

  // ✅ Only show "Forbidden" if we successfully checked and user is NOT staff
  if (!accessCheck.canAccess) {
    return (
      <ErrorScreen
        code="Erreur 403"
        title="Accès refusé"
        description="Ton compte n'est pas encore lié, ou tu n'as pas les rôles Discord nécessaires pour accéder à cet espace."
        tone="danger"
        actions={[
          { label: "Lier mon compte", href: "/dashboard", variant: "primary" },
          { label: "Retour à l'accueil", href: "/", variant: "secondary" },
        ]}
      />
    );
  }

  // Determine access level from staffUser role.
  //   RECRUITER → shell MEMBRE (sidebar membre + lien Recrutement) : un
  //               recruteur reste un membre, il garde la même navigation
  //               partout — seul le contenu des pages /staff/recruitments
  //               lui est ouvert. (Avant : sidebar staff réduite ≠ sidebar
  //               membre selon la page → navigation incohérente.)
  //   ENCADRANT → sidebar staff complète mais actions sensibles masquées
  //   *         → sidebar staff complète + actions complètes (Chef/EM/etc.)
  const roleCode = accessCheck.staffUser?.roleCode;
  if (roleCode === "RECRUITER") {
    return (
      <MemberLayoutShell isLinked={true} isRecruiter={true}>
        {children}
      </MemberLayoutShell>
    );
  }
  const accessLevel: "full" | "encadrant" =
    roleCode === "ENCADRANT" ? "encadrant" : "full";

  // Fetch RP name from member record
  const discordId = (session as any).discordId as string | null;
  let rpName: string | null = null;
  if (discordId) {
    const member = await prisma.member.findFirst({
      where: { discordId },
      select: { rpName: true },
    }).catch(() => null);
    rpName = member?.rpName ?? null;
  }

  // Staff: render normal staff layout
  return (
    <div className="relative">
      <StaffLayout
        accessLevel={accessLevel}
        user={{
          name: rpName ?? session.user?.name ?? null,
          image: session.user?.image ?? null,
        }}
      >
        {children}
      </StaffLayout>
    </div>
  );
}
