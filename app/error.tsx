"use client";

/**
 * app/error.tsx : catch-all pour tous les segments qui n'ont pas leur
 * propre error.tsx. C'est ce qui s'affichait avant en "page toute dégueu"
 * Next.js par défaut.
 */

import { ErrorScreen } from "@/components/error-screen";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      code="Erreur 500"
      title="Oups, ça a planté"
      description="Une erreur inattendue s'est produite. On garde la trace dans les logs. Tu peux réessayer ou revenir à l'accueil."
      reference={error.digest}
      tone="danger"
      actions={[
        { label: "Réessayer", onClick: () => reset(), variant: "primary" },
        { label: "Retour à l'accueil", href: "/", variant: "secondary" },
      ]}
    />
  );
}
