"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function MemberLayoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      code="Erreur 500"
      title="Ton espace ne s'est pas chargé"
      description={error.message || "Une erreur inattendue s'est produite. Réessaie ou contacte un Chef sur Discord."}
      reference={error.digest}
      tone="danger"
      actions={[
        { label: "Réessayer", onClick: () => reset(), variant: "primary" },
        { label: "Retour à l'accueil", href: "/", variant: "secondary" },
      ]}
    />
  );
}
