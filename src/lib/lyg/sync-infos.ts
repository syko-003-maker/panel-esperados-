import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { lygProbeInfos } from "@/lib/lyg-probe-infos";
import { runControlledLygSync, type ControlledSyncResult, type SyncSource } from "@/lib/lyg/sync-runner";

type InfosSyncMetrics = {
  name: string | null;
  money: number;
  points: number | null;
  sourcePath: string | null;
};

export type InfosSyncResult = ControlledSyncResult<InfosSyncMetrics>;

function parseMoneyLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const direct = Number(trimmed.replace(/\s+/g, ""));
    if (Number.isFinite(direct)) return Math.trunc(direct);
    const normalized = trimmed.replace(/,/g, ".").replace(/[^\d.-]/g, "").replace(/(?!^)-/g, "");
    if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function parsePointsLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim().replace(/\s+/g, ""));
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function extractFamilyInfosPayload(json: any): any {
  const root = json?.data ?? json;
  return root?.data ?? root;
}

export async function runLygInfosSync(source: SyncSource = "cron"): Promise<InfosSyncResult> {
  const familyId = DEFAULT_FAMILY_ID;

  return runControlledLygSync<InfosSyncMetrics>({
    type: "infos",
    source,
    familyId,
    minIntervalMs: 60 * 60_000,
    lockTtlMs: 120_000,
    run: async () => {
      const probe = await lygProbeInfos(familyId, { timeoutMs: 15_000 });
      if (!probe.ok || !probe.data) {
        const err: any = new Error(probe.error ?? "LYG infos unavailable");
        if (probe.probeResults.some((row) => row.status === 429)) {
          err.status = 429;
          err.message = "Rate limit LYG infos";
        }
        throw err;
      }

      const data = extractFamilyInfosPayload(probe.data);
      if (!data) {
        throw new Error("Unexpected infos payload");
      }

      const money = parseMoneyLike(data.money);
      const points = parsePointsLike(data.points);
      if (money == null) {
        throw new Error("Canonical family money missing in infos payload");
      }

      const syncedAt = new Date();
      const row = await prisma.family.upsert({
        where: { slug: familyId },
        update: { name: data.name ?? null },
        create: { slug: familyId, name: data.name ?? null },
        select: { name: true },
      });

      await prisma.syncState.upsert({
        where: { key: `infos:${familyId}` },
        update: { syncedAt, meta: { name: row.name, money, points } },
        create: { key: `infos:${familyId}`, syncedAt, meta: { name: row.name, money, points } },
      });

      return {
        name: row.name ?? null,
        money,
        points,
        sourcePath: probe.probedPath ?? null,
      };
    },
  });
}