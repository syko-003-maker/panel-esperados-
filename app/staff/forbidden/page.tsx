import { ErrorScreen } from "@/components/error-screen";

type StaffForbiddenPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getReasonValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim().toLowerCase();
  return String(value ?? "").trim().toLowerCase();
}

export default async function StaffForbiddenPage({ searchParams }: StaffForbiddenPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const reason = getReasonValue(resolvedSearchParams?.reason);
  const isDiscordUnavailable = reason === "discord";

  const title = isDiscordUnavailable ? "Vérification Discord indisponible" : "Accès refusé";
  const description = isDiscordUnavailable
    ? "Impossible de vérifier tes rôles Discord pour le moment. Réessaie dans quelques instants."
    : "Ton compte n'est pas encore lié, ou tu n'as pas les rôles Discord nécessaires pour accéder à cet espace.";
  const primaryHref = isDiscordUnavailable ? "/staff/dashboard" : "/dashboard";
  const primaryLabel = isDiscordUnavailable ? "Réessayer" : "Lier mon compte";

  return (
    <ErrorScreen
      code={isDiscordUnavailable ? "Discord indisponible" : "Erreur 403"}
      title={title}
      description={description}
      tone={isDiscordUnavailable ? "warning" : "danger"}
      actions={[
        { label: primaryLabel, href: primaryHref, variant: "primary" },
        { label: "Retour à l'accueil", href: "/", variant: "secondary" },
      ]}
    />
  );
}
