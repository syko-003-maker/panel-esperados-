import { requireStaffAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import StaffLinkForm, { type Link } from "./StaffLinkForm";
import { redirect } from "next/navigation";
import { PageShell, SectionCard } from "@/components/staff/ui";
import { Link as LinkIcon, Info } from "lucide-react";

const DEFAULT_FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

function toPlain(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (
    value !== null &&
    (value as any).constructor?.name === "Decimal" &&
    typeof (value as any).toString === "function"
  ) {
    return (value as any).toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item));
  }
  if (typeof value === "object" && value !== null) {
    const plain: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      plain[key] = toPlain(entry);
    }
    return plain;
  }
  return value;
}

/**
 * ✅ SECURITY: /staff/link access control
 * ✅ FEATURE: Support ?discordId= query param (from link-request workflow)
 * 
 * Only staff with canAccessStaffPanel=true can access this page (read + write)
 */
export default async function StaffLinkPage(props: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // ✅ RBAC: Require basic staff access (any user with canAccessStaffPanel=true)
  const guard = await requireStaffAccess();
  if (guard instanceof Response) {
    redirect("/staff/forbidden");
  }

  // Get current user's discord ID (from guard data)
  const currentUserDiscordId = (guard as any)?.session?.discordId;

  const links = await prisma.member.findMany({
    where: { familyId: DEFAULT_FAMILY_ID },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      discordId: true,
      steamId: true,
      rpName: true,
      grade: true,
      gradeLevel: true,
      roleDiscordId: true,
      isActive: true,
      joinedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const initialLinks = links.map((link) => toPlain(link)) as Link[];

  // ✅ Support ?discordId= query param from link-request workflow
  const discordIdParam = props.searchParams?.discordId 
    ? String(props.searchParams.discordId)
    : undefined;

  return (
    <PageShell
      title="Liaison Membre"
      description="Lier un compte Discord à Steam pour accéder au panel staff"
      icon={LinkIcon}
    >
      <div className="grid gap-6 max-w-4xl mx-auto">
        {/* Guide */}
        <SectionCard title="Guide de liaison" icon={Info}>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Étape 1 :</strong> Le membre envoie une demande de liaison via <code className="text-xs bg-slate-900/60 px-1.5 py-0.5 rounded">/link-request</code> sur Discord
            </p>
            <p>
              <strong className="text-foreground">Étape 2 :</strong> Vérifiez l&apos;identité du membre (Discord ID + SteamID64)
            </p>
            <p>
              <strong className="text-foreground">Étape 3 :</strong> Remplissez le formulaire ci-dessous avec le Discord ID, SteamID64 et Nom RP
            </p>
            <p>
              <strong className="text-foreground">Étape 4 :</strong> Une fois lié, le membre peut se connecter au panel avec son compte Discord
            </p>
          </div>
        </SectionCard>

        {/* Form */}
        <SectionCard title="Nouveau lien">
          <StaffLinkForm 
            initialLinks={initialLinks}
            prefilledDiscordId={discordIdParam}
            currentUserDiscordId={currentUserDiscordId}
          />
        </SectionCard>
      </div>
    </PageShell>
  );
}
