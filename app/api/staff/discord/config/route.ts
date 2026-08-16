import { toFamilyCuid } from "@/lib/family";
import { NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { getOrCreateDiscordConfig } from "@/lib/discord/discord";

const STRING_FIELDS = [
  "recruitmentChannelId",
  "complaintsChannelId",
  "complaintCategoryId",
  "meetingsChannelId",
  "absencesChannelId",
  "sanctionsChannelId",
  "logsChannelId",
  "bankAlertsChannelId",
  "bankDebtStaffChannelId",
  "staffRoleId",
  // New log channels
  "ticketsLogChannelId",
  "sanctionsLogChannelId",
  "meetingsLogChannelId",
  "activityLogChannelId",
] as const;

const INT_FIELDS = [
  "bankDebtPingThreshold",
  "bankDebtPingCooldownMinutes",
  "bankDebtPingCooldownDays",
  "bankDebtEscalateAfter",
] as const;
const BOOL_FIELDS = [
  "bankDebtPingEnabled",
  "bankDebtAutoEnabled",
  "dmNotificationsEnabled",
  "dmSanctionsEnabled",
  "dmGradeChangesEnabled",
] as const;

function pickUpdates(body: any) {
  const data: Record<string, string | number | boolean | null> = {};
  for (const key of STRING_FIELDS) {
    if (key in body) {
      const raw = String(body[key] ?? "").trim();
      data[key] = raw ? raw : null;
    }
  }
  for (const key of INT_FIELDS) {
    if (key in body) {
      const raw = body[key];
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        if (key === "bankDebtPingThreshold") data[key] = null;
        if (key === "bankDebtPingCooldownMinutes") data[key] = 60;
        if (key === "bankDebtPingCooldownDays") data[key] = 7;
        if (key === "bankDebtEscalateAfter") data[key] = 3;
        continue;
      }
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        data[key] = Math.max(0, Math.floor(parsed));
      }
    }
  }
  for (const key of BOOL_FIELDS) {
    if (key in body) {
      const raw = body[key];
      data[key] = raw === true || raw === "true" || raw === "1" || raw === "on";
    }
  }
  return data;
}

export async function GET(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = await toFamilyCuid(searchParams.get("familyId"));

  const config = await getOrCreateDiscordConfig(familyId);
  return NextResponse.json({ ok: true, config });
}

export async function POST(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const familyId = await toFamilyCuid(String(searchParams.get("familyId") ?? body.familyId ?? "").trim());
  const data = pickUpdates(body);
  const existing = await prisma.discordConfig.findUnique({ where: { familyId } });
  const nextEnabled =
    typeof data.bankDebtPingEnabled === "boolean"
      ? data.bankDebtPingEnabled
      : existing?.bankDebtPingEnabled ?? false;
  const nextBankAlerts =
    typeof data.bankAlertsChannelId === "string"
      ? data.bankAlertsChannelId
      : existing?.bankAlertsChannelId ?? null;

  if (nextEnabled && !nextBankAlerts) {
    return NextResponse.json(
      { ok: false, error: "bankAlertsChannelId required when bankDebtPingEnabled is true" },
      { status: 400 }
    );
  }

  const config = await prisma.discordConfig.upsert({
    where: { familyId },
    update: data,
    create: { familyId, ...data },
  });

  return NextResponse.json({ ok: true, config });
}

export async function PATCH(req: Request) {
  return POST(req);
}
