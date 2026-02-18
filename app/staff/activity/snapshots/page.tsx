import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { ActivitySnapshotsClient } from "./snapshots-client";

export default async function ActivitySnapshotsPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const user = session.user as any;
  if (!user?.isStaff) {
    redirect("/");
  }

  const familyId = DEFAULT_FAMILY_ID;

  // Get latest snapshots
  const snapshots = await prisma.activitySnapshot.findMany({
    where: { familyId },
    orderBy: [{ periodEnd: "desc" }, { status: "asc" }],
    take: 200,
  });

  // Get member info
  const discordIds = [...new Set(snapshots.map((s) => s.memberDiscordId))];
  const members = await prisma.member.findMany({
    where: { familyId, discordId: { in: discordIds } },
    select: { discordId: true, rpName: true, grade: true },
  });

  const memberMap = Object.fromEntries(members.map((m) => [m.discordId, m]));

  const enrichedSnapshots = snapshots.map((s) => ({
    ...s,
    member: memberMap[s.memberDiscordId] ?? null,
  }));

  // Stats
  const latestPeriod = snapshots[0]?.periodEnd ?? null;
  const latestSnapshots = latestPeriod
    ? snapshots.filter((s) => s.periodEnd.getTime() === latestPeriod.getTime())
    : [];

  const stats = {
    total: latestSnapshots.length,
    ok: latestSnapshots.filter((s) => s.status === "OK").length,
    warn: latestSnapshots.filter((s) => s.status === "WARN").length,
    ko: latestSnapshots.filter((s) => s.status === "KO").length,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Snapshots d'activité</h1>
      <ActivitySnapshotsClient initialSnapshots={enrichedSnapshots} stats={stats} />
    </div>
  );
}
