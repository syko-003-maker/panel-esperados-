"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      code="Erreur dashboard"
      title="Impossible de charger le tableau de bord"
      description={error.message || "Une erreur inattendue est survenue lors du chargement de tes infos."}
      reference={error.digest}
      tone="danger"
      actions={[
        { label: "Réessayer", onClick: () => reset(), variant: "primary" },
      ]}
    />
  );
}
