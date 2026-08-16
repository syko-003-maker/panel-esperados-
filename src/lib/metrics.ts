/**
 * Metrics & Observability Utilities
 * Track events across panel and worker
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toFamilyCuid } from "@/lib/family";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type MetricSource = "panel" | "worker";

export type MetricType =
  // Ticket events
  | "ticket.create"
  | "ticket.close"
  | "ticket.claim"
  // Ingest events
  | "ingest.ok"
  | "ingest.ko"
  | "ingest.recruitment"
  | "ingest.complaint"
  // Meeting events
  | "meeting.create"
  | "meeting.finalize"
  | "meeting.publish"
  // Sanction events
  | "sanction.create"
  | "sanction.close"
  | "sanction.expire"
  // Member events
  | "member.create"
  | "member.grade.change"
  | "member.import"
  // Sync events
  | "sync.roles.run"
  | "sync.roles.change"
  | "sync.banklogs"
  | "sync.members"
  // Activity events
  | "activity.compute"
  | "activity.snapshot"
  // System events
  | "system.startup"
  | "system.error"
  | "system.alert";

export type MetricEventInput = {
  familyId?: string;
  source: MetricSource;
  type: MetricType | string;
  ref?: string | null;
  meta?: Record<string, unknown> | null;
};

// ─────────────────────────────────────────────────────────────
// Event Recording
// ─────────────────────────────────────────────────────────────

const DEFAULT_FAMILY_ID = "esperados";

/**
 * Record a metric event
 */
export async function recordMetric(input: MetricEventInput): Promise<string> {
  try {
    const event = await prisma.metricEvent.create({
      data: {
        // Convention CUID : le slug est accepte en entree, jamais ecrit.
        familyId: await toFamilyCuid(input.familyId ?? DEFAULT_FAMILY_ID),
        source: input.source,
        type: input.type,
        ref: input.ref ?? null,
        meta: input.meta === null ? Prisma.JsonNull : (input.meta as Prisma.InputJsonValue),
      },
    });
    return event.id;
  } catch (error) {
    console.error("[recordMetric] Failed to record metric:", error);
    throw error;
  }
}

/**
 * Record multiple metric events in batch
 */
export async function recordMetrics(inputs: MetricEventInput[]): Promise<number> {
  try {
    // Une seule resolution pour tout le lot : les entrees partagent la famille.
    const defaultFamilyCuid = await toFamilyCuid(DEFAULT_FAMILY_ID);
    const result = await prisma.metricEvent.createMany({
      data: await Promise.all(inputs.map(async (input) => ({
        familyId: input.familyId ? await toFamilyCuid(input.familyId) : defaultFamilyCuid,
        source: input.source,
        type: input.type,
        ref: input.ref ?? null,
        meta: input.meta === null ? Prisma.JsonNull : (input.meta as Prisma.InputJsonValue),
      }))),
    });
    return result.count;
  } catch (error) {
    console.error("[recordMetrics] Failed to record metrics:", error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────

/**
 * Record panel metric
 */
export function recordPanelMetric(
  type: MetricType | string,
  ref?: string | null,
  meta?: Record<string, unknown>
) {
  return recordMetric({
    source: "panel",
    type,
    ref,
    meta,
  });
}

/**
 * Record worker metric (used by API endpoint)
 */
export function recordWorkerMetric(
  type: MetricType | string,
  ref?: string | null,
  meta?: Record<string, unknown>
) {
  return recordMetric({
    source: "worker",
    type,
    ref,
    meta,
  });
}

// ─────────────────────────────────────────────────────────────
// Query Functions
// ─────────────────────────────────────────────────────────────

export type MetricCountResult = {
  type: string;
  count: number;
  date: string;
};

/**
 * Get metric counts grouped by type and day
 */
export async function getMetricCounts(options: {
  familyId?: string;
  types?: string[];
  days?: number;
}): Promise<MetricCountResult[]> {
  const { familyId: familyIdOrSlug = DEFAULT_FAMILY_ID, types, days = 7 } = options;
  const familyId = await toFamilyCuid(familyIdOrSlug);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const where: any = {
    familyId,
    createdAt: { gte: startDate },
  };

  if (types && types.length > 0) {
    where.type = { in: types };
  }

  // Group by day and type
  const events = await prisma.metricEvent.findMany({
    where,
    select: {
      type: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Aggregate by day + type
  const counts = new Map<string, number>();
  for (const event of events) {
    const date = event.createdAt.toISOString().split("T")[0];
    const key = `${date}|${event.type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const results: MetricCountResult[] = [];
  for (const [key, count] of counts.entries()) {
    const [date, type] = key.split("|");
    results.push({ date, type, count });
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get recent metric events
 */
export async function getRecentMetrics(options: {
  familyId?: string;
  types?: string[];
  limit?: number;
}) {
  const { familyId: familyIdOrSlug = DEFAULT_FAMILY_ID, types, limit = 50 } = options;
  const familyId = await toFamilyCuid(familyIdOrSlug);

  const where: any = { familyId };
  if (types && types.length > 0) {
    where.type = { in: types };
  }

  return prisma.metricEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Count metrics in a time window
 */
export async function countMetricsInWindow(options: {
  familyId?: string;
  type: string;
  windowMinutes: number;
}): Promise<number> {
  const { familyId: familyIdOrSlug = DEFAULT_FAMILY_ID, type, windowMinutes } = options;
  const familyId = await toFamilyCuid(familyIdOrSlug);

  const startDate = new Date();
  startDate.setMinutes(startDate.getMinutes() - windowMinutes);

  return prisma.metricEvent.count({
    where: {
      familyId,
      type,
      createdAt: { gte: startDate },
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Heartbeat Functions
// ─────────────────────────────────────────────────────────────

/**
 * Update worker heartbeat
 */
export async function updateWorkerHeartbeat(
  familyIdOrSlug: string = DEFAULT_FAMILY_ID,
  workerName?: string,
  meta?: Record<string, unknown>
) {
  const familyId = await toFamilyCuid(familyIdOrSlug);
  return prisma.workerHeartbeat.upsert({
    where: { familyId },
    create: {
      familyId,
      workerName,
      lastSeenAt: new Date(),
      meta: meta ? (meta as Prisma.InputJsonValue) : undefined,
    },
    update: {
      workerName,
      lastSeenAt: new Date(),
      meta: meta ? (meta as Prisma.InputJsonValue) : undefined,
    },
  });
}

/**
 * Get worker heartbeat status
 */
export async function getWorkerHeartbeat(familyIdOrSlug: string = DEFAULT_FAMILY_ID) {
  const familyId = await toFamilyCuid(familyIdOrSlug);
  return prisma.workerHeartbeat.findUnique({
    where: { familyId },
  });
}

/**
 * Check if worker is online (heartbeat within threshold)
 */
export async function isWorkerOnline(
  familyId: string = DEFAULT_FAMILY_ID,
  thresholdMinutes: number = 5
): Promise<boolean> {
  const heartbeat = await getWorkerHeartbeat(familyId);
  if (!heartbeat) return false;

  const threshold = new Date();
  threshold.setMinutes(threshold.getMinutes() - thresholdMinutes);

  return heartbeat.lastSeenAt >= threshold;
}

// ─────────────────────────────────────────────────────────────
// Alert Functions
// ─────────────────────────────────────────────────────────────

export type AlertSeverity = "info" | "warning" | "critical";

/**
 * Create an alert
 */
export async function createAlert(options: {
  familyId?: string;
  type: string;
  severity?: AlertSeverity;
  message: string;
  meta?: Record<string, unknown>;
}) {
  const { familyId: familyIdOrSlug = DEFAULT_FAMILY_ID, type, severity = "warning", message, meta } = options;
  const familyId = await toFamilyCuid(familyIdOrSlug);

  return prisma.alertEvent.create({
    data: {
      familyId,
      type,
      severity,
      message,
      meta: meta ? (meta as Prisma.InputJsonValue) : undefined,
    },
  });
}

/**
 * Resolve an alert
 */
export async function resolveAlert(alertId: string) {
  return prisma.alertEvent.update({
    where: { id: alertId },
    data: { resolvedAt: new Date() },
  });
}

/**
 * Get active (unresolved) alerts
 */
export async function getActiveAlerts(familyIdOrSlug: string = DEFAULT_FAMILY_ID) {
  const familyId = await toFamilyCuid(familyIdOrSlug);
  return prisma.alertEvent.findMany({
    where: {
      familyId,
      resolvedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get recent alerts
 */
export async function getRecentAlerts(options: {
  familyId?: string;
  limit?: number;
  includeResolved?: boolean;
}) {
  const { familyId: familyIdOrSlug = DEFAULT_FAMILY_ID, limit = 50, includeResolved = true } = options;
  const familyId = await toFamilyCuid(familyIdOrSlug);

  const where: any = { familyId };
  if (!includeResolved) {
    where.resolvedAt = null;
  }

  return prisma.alertEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
