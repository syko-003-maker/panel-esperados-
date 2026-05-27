"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      code="Erreur staff"
      title="Le panel staff a planté"
      description="Une erreur s'est produite sur cette page staff. Réessaie ou retourne au dashboard."
      reference={error.digest}
      tone="danger"
      actions={[
        { label: "Réessayer", onClick: () => reset(), variant: "primary" },
        { label: "Dashboard staff", href: "/staff/dashboard", variant: "secondary" },
      ]}
    />
  );
}
