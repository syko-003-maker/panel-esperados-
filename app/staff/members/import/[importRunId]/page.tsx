import { redirect, notFound } from "next/navigation";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { ImportRunDetailClient } from "./import-run-detail-client";

export default async function ImportRunDetailPage({
  params,
}: {
  params: Promise<{ importRunId: string }>;
}) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const user = session.user as any;
  if (!user?.isStaff) {
    redirect("/");
  }

  const { importRunId } = await params;

  const importRun = await prisma.importRun.findUnique({
    where: { id: importRunId },
    include: {
      rows: {
        orderBy: { rowNumber: "asc" },
      },
    },
  });

  if (!importRun) {
    notFound();
  }

  return <ImportRunDetailClient importRun={importRun} />;
}
