import { ErrorScreen } from "@/components/error-screen";

export default function NotFound() {
  return (
    <ErrorScreen
      code="Erreur 404"
      title="Page introuvable"
      description="Cette page n'existe pas ou a été déplacée. Reviens à l'accueil pour continuer."
      tone="warning"
      actions={[
        { label: "Retour à l'accueil", href: "/", variant: "primary" },
      ]}
    />
  );
}
