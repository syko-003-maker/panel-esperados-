import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { MemberDetailClient } from "./member-detail-client";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ discordId: string }>;
}) {
  const { discordId } = await params;

  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  // Resolve isChef for UI permissions (best-effort)
  const userEmail = guard.session?.user?.email ?? null;
  const dbUser = userEmail
    ? await prisma.user.findFirst({ where: { email: userEmail }, select: { isChef: true } })
    : null;

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  const member = await prisma.member.findUnique({
    where: {
      familyId_discordId: { familyId: familyDbId, discordId },
    },
    include: {
      gradeHistory: {
        orderBy: { changedAt: "desc" },
        take: 20,
      },
      discordSnapshot: {
        select: {
          rolesJson: true,
        },
      },
      sanctions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          type: true,
          reason: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!member) {
    notFound();
  }

  const data = {
    id: member.id,
    discordId: member.discordId ?? "",
    steamId: member.steamId,
    rpName: member.rpName,
    discordDisplayName: member.discordDisplayName,
    discordUsername: member.discordUsername,
    age: member.age,
    grade: member.grade,
    gradeLevel: member.gradeLevel,
    roleDiscordId: member.roleDiscordId,
    rankRoleId: member.rankRoleId,
    rankLabel: member.rankLabel,
    discordRoleIds: member.discordRoleIds,
    discordLastError: member.discordLastError,
    discordSnapshotRolesJson: member.discordSnapshot?.rolesJson ?? null,
    isActive: member.isActive,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    gradeHistory: member.gradeHistory.map((h) => ({
      id: h.id,
      oldGrade: h.oldGrade,
      newGrade: h.newGrade,
      changedAt: h.changedAt.toISOString(),
      changedBy: h.changedBy,
      source: h.source,
      notes: h.notes,
    })),
    sanctions: member.sanctions.map((s) => ({
      id: s.id,
      type: s.type,
      reason: s.reason,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return <MemberDetailClient member={data} isChef={dbUser?.isChef ?? false} />;
}
