import { Button } from "@/components/ui/button";
import { AlertCircle, HomeIcon, Link as LinkIcon } from "lucide-react";
import Link from "next/link";

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
    ? "Impossible de vérifier vos rôles Discord pour le moment. Réessayez plus tard." 
    : "Ton compte n'est pas encore lié ou tu n'as pas accès à cet espace.";
  const primaryHref = isDiscordUnavailable ? "/staff/dashboard" : "/dashboard";
  const primaryLabel = isDiscordUnavailable ? "Réessayer" : "Lier mon compte";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
        <div className="flex gap-3 pt-2">
          <Button className="flex-1" asChild>
            <Link href={primaryHref}>
              <LinkIcon className="h-4 w-4 mr-2" />
              {primaryLabel}
            </Link>
          </Button>
          <Button variant="outline" className="flex-1 border-slate-800" asChild>
            <Link href="/">
              <HomeIcon className="h-4 w-4 mr-2" />
              Retour à l'accueil
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
