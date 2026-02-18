import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { MemberImportClient } from "./import-client";

export default async function StaffMemberImportPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const user = session.user as any;
  if (!user?.isStaff) {
    redirect("/");
  }

  const familyId = DEFAULT_FAMILY_ID;

  // Get recent import runs
  const recentRuns = await prisma.importRun.findMany({
    where: { familyId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      source: true,
      fileName: true,
      totalRows: true,
      insertedCount: true,
      updatedCount: true,
      skippedCount: true,
      errorCount: true,
      createdAt: true,
    },
  });

  return <MemberImportClient recentRuns={recentRuns} />;
}
