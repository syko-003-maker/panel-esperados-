import { LoadingState } from "@/components/staff/ui/LoadingState";

/**
 * Loading UI partagé pour toutes les pages /staff/*.
 * Next.js le rend automatiquement pendant que la prochaine page (server
 * component) résout ses fetches Prisma/Discord — évite l'effet "page figée".
 *
 * Sous-routes peuvent override en posant leur propre loading.tsx.
 */
export default function StaffLoading() {
  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <LoadingState
        title="Chargement"
        description="La page staff est en cours de préparation…"
      />
    </div>
  );
}
