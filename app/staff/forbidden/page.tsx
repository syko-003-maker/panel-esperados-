import { Button } from "@/components/ui/button";
import { AlertCircle, HomeIcon, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function StaffForbiddenPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const reason = searchParams?.reason;
  const isDiscordDown = reason === "discord";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          {isDiscordDown ? "Discord indisponible" : "Accès refusé"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isDiscordDown
            ? "La vérification des rôles Discord est temporairement indisponible. Réessayez dans quelques instants."
            : "Vous n'avez pas les permissions nécessaires pour accéder à cette page."}
        </p>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1 border-slate-800" asChild>
            <Link href="/staff/dashboard">
              <HomeIcon className="h-4 w-4 mr-2" />
              Dashboard
            </Link>
          </Button>
          {isDiscordDown ? (
            <Button className="flex-1" asChild>
              <Link href="/staff/dashboard">
                <RefreshCw className="h-4 w-4 mr-2" />
                Réessayer
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" className="flex-1" asChild>
              <Link href="/dashboard">Mon espace</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
