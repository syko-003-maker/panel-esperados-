import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";
import { BLACKLIST_ROLE_ID } from "@/lib/discord-grade";
import { PlaintesClient } from "./client";

export default async function PlaintesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const scope = await getMemberScopeOrNull(session);
  if (!scope) redirect("/dashboard");

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const rawMembers = await prisma.member.findMany({
    where: { familyId: familyDbId, isActive: true, id: { not: scope.memberId }, rpName: { not: null } },
    select: { id: true, rpName: true, discordRoleIds: true },
    orderBy: { rpName: "asc" },
  });
  // Exclure démotés / blacklistés (isActive mais plus dans la famille active).
  const targets = rawMembers
    .filter((m) => {
      const roles = Array.isArray(m.discordRoleIds) ? (m.discordRoleIds as string[]) : [];
      return !roles.includes(DEMOTE_ROLE_ID) && !roles.includes(BLACKLIST_ROLE_ID);
    })
    .map((m) => ({ id: m.id, name: m.rpName ?? "?" }));

  return <PlaintesClient targets={targets} />;
}
