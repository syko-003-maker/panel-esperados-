import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { isDisplayableStaffMember } from "@/lib/staff/member-scope";
import { PlaintesClient } from "./client";

export default async function PlaintesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const scope = await getMemberScopeOrNull(session);
  if (!scope) redirect("/dashboard");

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const rawMembers = await prisma.member.findMany({
    where: { familyId: familyDbId, isActive: true, id: { not: scope.memberId }, rpName: { not: null } },
    select: {
      id: true,
      rpName: true,
      discordRoleIds: true,
      discordId: true,
      isActive: true,
      isGhost: true,
      discordInGuild: true,
      missingFromLygSince: true,
      grade: true,
      rankRoleId: true,
      rankLabel: true,
    },
    orderBy: { rpName: "asc" },
  });
  // Ne garder que les membres ACTIFS de la famille : exclut démotés, blacklistés,
  // réservistes, ghosts, partis du serveur Discord / de la famille LYG.
  const targets = rawMembers
    .filter((m) => isDisplayableStaffMember(m as never))
    .map((m) => ({ id: m.id, name: m.rpName ?? "?" }));

  return <PlaintesClient targets={targets} />;
}
