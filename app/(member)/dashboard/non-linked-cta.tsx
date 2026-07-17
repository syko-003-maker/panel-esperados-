"use client";

import { signOut } from "next-auth/react";
import { LogOut, MessageCircle, UserPlus } from "lucide-react";

/**
 * Écran affiché quand un compte Discord connecté n'est lié à AUCUN membre.
 *
 * Volontairement PAS de demande de liaison en self-service : l'accès au panel
 * passe uniquement par un recrutement validé (ou un lien fait par le staff).
 * On oriente donc l'utilisateur vers le recrutement / un Recruteur / EM / Chef.
 */
export function NonLinkedCta() {
  const handleLogout = async () => {
    await signOut({ redirect: true, callbackUrl: "/login" });
  };

  return (
    <div className="p-6">
      <div className="mx-auto max-w-lg">
        <div className="space-y-6 rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-950/40 to-zinc-900 p-8">
          {/* En-tête */}
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl text-red-400 ring-1 ring-red-500/30">
              🔒
            </div>
            <h1 className="text-3xl font-bold text-red-400">Accès réservé aux membres</h1>
            <p className="text-sm leading-relaxed text-slate-300">
              Ton compte Discord n'est lié à aucun membre de la famille. L'accès au panel se fait{" "}
              <strong className="text-slate-100">uniquement après un recrutement validé</strong>.
            </p>
          </div>

          {/* Comment rejoindre */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div className="text-sm text-slate-300">
                <div className="font-semibold text-slate-100">Passe par le recrutement</div>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">
                  Fais ta candidature via le recrutement sur notre Discord. Une fois recruté, ton accès au
                  panel (Banque, Justificatifs…) sera activé automatiquement.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div className="text-sm text-slate-300">
                <div className="font-semibold text-slate-100">Ou contacte le staff</div>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">
                  Adresse-toi à un <strong className="text-slate-200">Recruteur</strong>, un{" "}
                  <strong className="text-slate-200">État-Major</strong> ou un{" "}
                  <strong className="text-slate-200">Chef</strong> sur le Discord de la famille.
                </p>
              </div>
            </div>
          </div>

          {/* Déconnexion */}
          <button
            onClick={handleLogout}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:border-red-500/60 hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}
