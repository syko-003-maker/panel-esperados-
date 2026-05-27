import { ErrorScreen } from "@/components/error-screen";

export default function StaffNotFound() {
  return (
    <ErrorScreen
      code="Erreur 404"
      title="Page staff introuvable"
      description="Cette section staff n'existe pas ou a été déplacée. Retour au dashboard pour continuer."
      tone="warning"
      actions={[
        { label: "Dashboard staff", href: "/staff/dashboard", variant: "primary" },
      ]}
    />
  );
}
