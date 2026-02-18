import { auth } from "@/auth";
import { StaffLayout } from "@/components/staff-layout";
import { redirect } from "next/navigation";
import { canAccessStaffPanel } from "@/lib/rbac";

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
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Background Effects */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl opacity-30" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl opacity-20" />
        </div>

        {/* Main Container */}
        <div className="w-full max-w-md space-y-8 text-center">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/20 border border-amber-500/50">
              <svg
                className="w-10 h-10 text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white">Erreur de connexion</h1>
            <p className="text-slate-400 text-lg">
              Impossible de vérifier vos permissions. Le système d'authentification rencontre un problème.
            </p>
            <p className="text-sm text-amber-400/80 font-mono bg-black/30 p-3 rounded border border-amber-500/20">
              {fetchError}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex gap-3 justify-center">
            <a
              href="/staff/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Réessayer
            </a>
            <a
              href="/api/debug/explain-access"
              target="_blank"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-colors duration-200"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Debug Info
            </a>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-slate-500">
            <p>Los Esperados © 2026 • Si le problème persiste, contactez un administrateur</p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Only show "Forbidden" if we successfully checked and user is NOT staff
  if (!accessCheck.canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Background Effects */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-500/20 rounded-full blur-3xl opacity-30" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-red-500/10 rounded-full blur-3xl opacity-20" />
        </div>

        {/* Main Container */}
        <div className="w-full max-w-md space-y-8 text-center">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 border border-red-500/50">
              <svg
                className="w-10 h-10 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white">Accès Refusé</h1>
            <p className="text-slate-400 text-lg">
              Cette section est réservée au personnel. Vous n'avez pas les
              permissions nécessaires pour accéder à cette page.
            </p>
            <p className="text-xs text-slate-500 font-mono bg-black/30 p-2 rounded border border-slate-700/30">
              Source d'accès vérifiée: {accessCheck.source}
            </p>
          </div>

          {/* Action Button */}
          <div className="pt-4">
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Retour au tableau de bord
            </a>
          </div>

          {/* Debug Link */}
          <div className="pt-2">
            <a
              href="/api/debug/explain-access"
              target="_blank"
              className="text-sm text-slate-500 hover:text-slate-400 underline"
            >
              Voir pourquoi l'accès est refusé
            </a>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-slate-500">
            <p>Los Esperados © 2026</p>
          </div>
        </div>
      </div>
    );
  }

  // Determine access level from staffUser role or fallback to "full"
  const accessLevel = accessCheck.staffUser?.roleCode === "RECRUITER" ? "recruiter" : "full";

  // Staff: render normal staff layout
  return (
    <StaffLayout accessLevel={accessLevel}>
      {children}
    </StaffLayout>
  );
}
