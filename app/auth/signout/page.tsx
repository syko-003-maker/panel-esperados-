"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { PageShell, SectionCard } from "@/components/staff/ui";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LogOut, X } from "lucide-react";

export default function SignoutPage() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut({ callbackUrl: "/" });
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <PageShell
      title="Déconnexion"
      description="Êtes-vous sûr ?"
      icon={LogOut}
    >
      <div className="max-w-md mx-auto mt-8">
        <SectionCard>
          <div className="p-6 text-center space-y-6">
            <div>
              <p className="text-gray-300 mb-4">
                Voulez-vous vraiment vous déconnecter ?
              </p>
              <p className="text-sm text-gray-400">
                Vous devrez vous reconnecter pour accéder à nouveau au panel.
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSigningOut}
                className="flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                {isSigningOut ? "Déconnexion..." : "Se déconnecter"}
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
