/**
 * Layout pour les guides /guide/*.
 *
 * Comportement :
 *  - Visiteur non connecté → page sans sidebar (public, accessible direct)
 *  - Membre lié connecté → wrappé dans le shell membre (sidebar à gauche)
 *  - Staff connecté → wrappé dans le shell staff (sidebar staff à gauche)
 *
 * Pourquoi : les guides sont accessibles à tout le monde, mais quand un
 * utilisateur connecté navigue depuis sa sidebar (lien "Spécialisations"),
 * on veut qu'il garde sa sidebar à gauche pour pouvoir naviguer vers les
 * autres pages sans utiliser le bouton retour du navigateur.
 */

import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { canAccessStaffPanel } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { isRecruiter } from "@/lib/discord-roles";
import { MemberLayoutShell } from "../(member)/components/member-layout-shell";
import { StaffLayout } from "@/components/staff-layout";

export default async function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Visiteur non connecté : page brute, sans sidebar (les guides sont publics)
  if (!session) {
    return <>{children}</>;
  }

  // Tente de récupérer le membre lié à la session
  const linkedMember = await getMemberScopeOrNull(session).catch(() => null);

  // Pas lié : page brute également (on ne force pas le login pour lire un guide)
  if (!linkedMember) {
    return <>{children}</>;
  }

  // Détection staff (via RBAC unifié DB + Discord + legacy).
  // On garde aussi le roleCode pour adapter le accessLevel sidebar :
  // un Recruteur ne doit voir que sa propre sidebar réduite, pas toutes
  // les catégories du staff.
  let isStaff = false;
  let staffRoleCode: string | null = null;
  try {
    const accessCheck = await canAccessStaffPanel(session);
    isStaff = Boolean(accessCheck?.canAccess);
    staffRoleCode = accessCheck?.staffUser?.roleCode ?? null;
  } catch {
    isStaff = false;
  }

  // Staff connecté → shell staff avec sa sidebar.
  //   RECRUITER → shell MEMBRE (un recruteur garde sa sidebar membre partout,
  //               cohérent avec /staff/layout) — il tombe dans la branche
  //               membre ci-dessous avec isRecruiter=true ;
  //   ENCADRANT → sidebar complète mais actions sensibles masquées ;
  //   * (EM, Chef, etc.) → sidebar complète + write access.
  if (isStaff && staffRoleCode !== "RECRUITER") {
    const accessLevel: "full" | "encadrant" =
      staffRoleCode === "ENCADRANT" ? "encadrant" : "full";
    return <StaffLayout accessLevel={accessLevel}>{children}</StaffLayout>;
  }

  // Membre simple connecté → shell membre avec sa sidebar
  // On détecte aussi si recruteur pour conserver le lien "Recrutement"
  let memberIsRecruiter = false;
  try {
    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    const memberRecord = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: familyDbId, discordId: linkedMember.discordId } },
      select: { discordRoleIds: true },
    });
    if (memberRecord?.discordRoleIds) {
      memberIsRecruiter = isRecruiter(memberRecord.discordRoleIds as string[]);
    }
  } catch {
    /* non bloquant */
  }

  return (
    <MemberLayoutShell isLinked={true} isRecruiter={memberIsRecruiter}>
      {children}
    </MemberLayoutShell>
  );
}
