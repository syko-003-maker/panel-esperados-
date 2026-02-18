import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { DiagnosticsClient } from "./diagnostics-client";
import { DiagnosticsHealthClient } from "./diagnostics-health-client";

export default async function DiagnosticsPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const user = await prisma.user.findFirst({
    where: { email: session.user.email },
    select: { isStaff: true, isChef: true },
  });

  if (!user?.isStaff && !user?.isChef) {
    redirect("/");
  }

  const familyId = DEFAULT_FAMILY_ID;

  // ENV checks
  const envStatus = {
    INGEST_SECRET: !!process.env.INGEST_SECRET || !!process.env.DISCORD_INGEST_SECRET,
    NEXT_PUBLIC_DISCORD_GUILD_ID: !!process.env.NEXT_PUBLIC_DISCORD_GUILD_ID,
    DATABASE_URL: !!process.env.DATABASE_URL,
    FAMILY_ID: familyId,
  };

  // DB checks
  let dbOk = false;
  let dbError: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Unknown error";
  }

  // Family check
  let familyExists = false;
  try {
    const family = await prisma.family.findUnique({ where: { id: familyId } });
    familyExists = !!family;
  } catch {
    // ignore
  }

  // Counts
  const [recruitmentsOpen, recruitmentsTotal, complaintsOpen, complaintsTotal] = await Promise.all([
    prisma.recruitment.count({
      where: { familyId, ticketKey: { not: null }, closedAt: null },
    }),
    prisma.recruitment.count({
      where: { familyId, ticketKey: { not: null } },
    }),
    prisma.complaint.count({
      where: { familyId, ticketKey: { not: null }, status: "OPEN", closedAt: null },
    }),
    prisma.complaint.count({
      where: { familyId, ticketKey: { not: null } },
    }),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Diagnostics</h1>
        <p className="text-slate-400 mt-1">System health & configuration monitoring</p>
      </div>

      {/* Health Summary */}
      <div>
        <h2 className="text-xl font-semibold mb-3">🏥 System Health</h2>
        <DiagnosticsHealthClient />
      </div>

      {/* Legacy Diagnostics */}
      <div>
        <h2 className="text-xl font-semibold mb-3">⚙️ Configuration</h2>
        <DiagnosticsClient
          data={{
            envStatus,
            dbOk,
            dbError,
            familyExists,
            recruitmentsOpen,
            recruitmentsTotal,
            complaintsOpen,
            complaintsTotal,
            isChef: user?.isChef ?? false,
          }}
        />
      </div>
    </div>
  );
}
