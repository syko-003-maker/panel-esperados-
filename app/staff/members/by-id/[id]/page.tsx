import { redirect } from "next/navigation";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { MemberEditClient } from "./member-edit-client";

export default async function MemberEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Check staff authorization
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  const { id: memberId } = await params;
  if (!memberId || typeof memberId !== "string") {
    redirect("/staff/members");
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      familyId: true,
      discordId: true,
      steamId: true,
      rpName: true,
      rpNameOverride: true,
      source: true,
      grade: true,
      gradeLevel: true,
      isActive: true,
      joinedAt: true,
      updatedAt: true,
      playtimeRequiredMinutes: true,
    },
  });

  // member.familyId est l'ID DB (cuid), pas le slug — il faut résoudre le slug.
  // (Bug : comparer directement à DEFAULT_FAMILY_ID "esperados" redirigeait
  // toujours vers /staff/members → fiche non éditable.)
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  if (!member || member.familyId !== familyDbId) {
    redirect("/staff/members");
  }

  const serialized = {
    ...member,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    updatedAt: member.updatedAt.toISOString(),
  };

  return <MemberEditClient member={serialized} />;
}
