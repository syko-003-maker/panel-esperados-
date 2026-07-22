import { prisma } from "@/lib/db";
import { GRADE_LABEL_BY_ROLE_ID, resolveMemberGradeRoleId } from "@/lib/grade-colors";

/**
 * Mémorise le rang ACTUEL d'un membre comme « dernier rang avant réserviste »,
 * juste avant qu'on le passe réserviste (son rôle de grade va être retiré par le
 * rolePlan). Sert à restaurer son rang quand il revient dans la famille.
 *
 * Lit le rôle de grade Discord LIVE (le plus fiable). Ne fait rien s'il n'a pas
 * de rôle de grade détecté. Appelé depuis la création d'une sanction RESERVISTE
 * (route sanctions + finalisation de réunion).
 */
export async function capturePreReservistRank(member: {
  id: string;
  discordRoleIds?: string[] | null;
}): Promise<void> {
  const roles = (member.discordRoleIds as string[]) ?? [];
  const roleId = resolveMemberGradeRoleId(roles);
  if (!roleId) return;
  const label = GRADE_LABEL_BY_ROLE_ID[roleId];
  if (!label || label === "Réserviste") return;
  await prisma.member
    .update({
      where: { id: member.id },
      data: { preReservistGrade: label, preReservistRoleId: roleId },
    })
    .catch(() => {});
}
