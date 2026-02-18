import { NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { prisma } from "@/lib/db";

const DEFAULT_TEMPLATES = [
  {
    key: "recruitment.submitted",
    title: "Recruitment submitted",
    content: "New recruitment: {{discordId}} steam: {{steamId}} rp: {{rpName}} age: {{age}}",
  },
  {
    key: "recruitment.accepted",
    title: "Recruitment accepted",
    content: "Recruitment accepted: {{discordId}} rp: {{rpName}} steam: {{steamId}}",
  },
  {
    key: "recruitment.rejected",
    title: "Recruitment rejected",
    content: "Recruitment rejected: {{discordId}} rp: {{rpName}} steam: {{steamId}}",
  },
  {
    key: "complaint.created",
    title: "Complaint created",
    content: "New complaint: {{title}} ({{complainantId}} -> {{targetId}})",
  },
  {
    key: "sanction.created",
    title: "Sanction created",
    content: "Sanction {{type}} for {{discordId}}: {{reason}} (points: {{points}})",
  },
  {
    key: "absence.requested",
    title: "Absence requested",
    content: "Absence requested: {{discordId}} from {{startAt}} to {{endAt}}",
  },
  {
    key: "ME_ABSENCE_CREATED",
    title: "Member absence created",
    content: "Member absence: {{discordId}} from {{startAt}} to {{endAt}}",
  },
  {
    key: "absence_justification_created",
    title: "Absence justification",
    content: "Absence justification by {{discordId}} for {{absenceId}}",
  },
  {
    key: "ME_ABSENCE_JUSTIFIED",
    title: "Member absence justification",
    content: "Absence justification by {{discordId}} for {{absenceId}}: {{message}}",
  },
  {
    key: "sanction_justification_created",
    title: "Sanction justification",
    content: "Sanction justification by {{discordId}} for {{sanctionId}}",
  },
  {
    key: "ME_SANCTION_JUSTIFIED",
    title: "Member sanction justification",
    content: "Sanction justification by {{discordId}} for {{sanctionId}}: {{message}}",
  },
  {
    key: "BANK_DEBT_PING_SINGLE",
    title: "Los Esperados - Banque",
    content: "{{mention}} Tu es en deficit de {{deficitAmountFormatted}}. Merci de rembourser rapidement.",
  },
  {
    key: "absence.approved",
    title: "Absence approved",
    content: "Absence approved: {{discordId}} from {{startAt}} to {{endAt}}",
  },
  {
    key: "meeting.scheduled",
    title: "Meeting scheduled",
    content: "Meeting scheduled: {{title}} at {{scheduledAt}}",
  },
] as const;

async function ensureDefaults(familyId: string) {
  const existing = await prisma.discordTemplate.findMany({
    where: { familyId },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((t) => t.key));
  const missing = DEFAULT_TEMPLATES.filter((t) => !existingKeys.has(t.key));
  if (missing.length === 0) return;

  await prisma.discordTemplate.createMany({
    data: missing.map((t) => ({
      familyId,
      key: t.key,
      title: t.title,
      content: t.content,
      enabled: true,
    })),
    skipDuplicates: true,
  });
}

export async function GET(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get("familyId") ?? "esperados";

  await ensureDefaults(familyId);

  const data = await prisma.discordTemplate.findMany({
    where: { familyId },
    orderBy: { key: "asc" },
  });

  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const familyId = String(searchParams.get("familyId") ?? body.familyId ?? "esperados").trim() || "esperados";
  const key = String(body.key ?? "").trim();
  const content = String(body.content ?? "").trim();
  const title = String(body.title ?? "").trim();
  const enabled = body.enabled === undefined ? true : Boolean(body.enabled);

  if (!key) {
    return NextResponse.json({ ok: false, error: "MISSING_KEY" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ ok: false, error: "MISSING_CONTENT" }, { status: 400 });
  }

  const data = await prisma.discordTemplate.upsert({
    where: { familyId_key: { familyId, key } },
    update: {
      content,
      title: title || null,
      enabled,
    },
    create: {
      familyId,
      key,
      content,
      title: title || null,
      enabled,
    },
  });

  return NextResponse.json({ ok: true, data });
}
