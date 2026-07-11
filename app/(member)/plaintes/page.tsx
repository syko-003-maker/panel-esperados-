import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { PlaintesClient } from "./client";

export default async function PlaintesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const scope = await getMemberScopeOrNull(session);
  if (!scope) redirect("/dashboard");

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const members = await prisma.member.findMany({
    where: { familyId: familyDbId, isActive: true, id: { not: scope.memberId }, rpName: { not: null } },
    select: { id: true, rpName: true },
    orderBy: { rpName: "asc" },
  });
  const targets = members.map((m) => ({ id: m.id, name: m.rpName ?? "?" }));

  return <PlaintesClient targets={targets} />;
}
