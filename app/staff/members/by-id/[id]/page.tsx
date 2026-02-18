import { redirect } from "next/navigation";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
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
      grade: true,
      gradeLevel: true,
      isActive: true,
      joinedAt: true,
      updatedAt: true,
    },
  });

  if (!member || member.familyId !== DEFAULT_FAMILY_ID) {
    redirect("/staff/members");
  }

  const serialized = {
    ...member,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    updatedAt: member.updatedAt.toISOString(),
  };

  return <MemberEditClient member={serialized} />;
}
