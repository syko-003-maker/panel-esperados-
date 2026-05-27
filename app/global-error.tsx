"use client";

/**
 * global-error : DERNIER rempart de Next.js.
 *
 * Quand le root layout (app/layout.tsx) lui-même crashe, aucun autre
 * error.tsx ne peut tourner. Next.js cherche alors global-error.tsx pour
 * remplacer COMPLÈTEMENT l'arbre HTML/Body.
 *
 * Contraintes :
 *  - Doit inclure <html> et <body> (on remplace tout)
 *  - Doit être robuste : pas de dépendance qui pourrait crasher elle-même
 *  - Pas de Tailwind si possible (le CSS root peut ne pas être chargé)
 */

import { ErrorScreen } from "@/components/error-screen";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, background: "#0b0305" }}>
        <ErrorScreen
          code="Erreur 500"
          title="Quelque chose s'est cassé"
          description="Une erreur critique est survenue. On l'a notée — réessaie dans un instant."
          reference={error.digest}
          tone="danger"
          actions={[
            { label: "Réessayer", onClick: () => reset(), variant: "primary" },
            { label: "Retour à l'accueil", href: "/", variant: "secondary" },
          ]}
        />
      </body>
    </html>
  );
}
