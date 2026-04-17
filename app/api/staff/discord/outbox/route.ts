import { NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";

const STATUSES = ["PENDING", "SENDING", "SENT", "FAILED", "CANCELED"] as const;
const TYPES = [
  "SEND_MESSAGE",
  "ASSIGN_ROLE",
  "REMOVE_ROLE",
  "ME_ABSENCE_CREATED",
  "ME_ABSENCE_JUSTIFIED",
  "ME_SANCTION_JUSTIFIED",
  "BANK_DEBT_PING_SINGLE",
  "BANK_DEBT_PING_BATCH",
  "ABSENCE_JUSTIFICATION_CREATED",
  "SANCTION_JUSTIFICATION_CREATED",
  "SANCTION_NOTIFY",
  "SANCTION_APPLY",
  "RECRUITMENT_DECISION",
  "COMPLAINT_DECISION",
  "MEETING_NOTIFY_UPSERT",
  "MEETING_NOTIFY_RECAP",
  "ACTIVITY_ALERT_INACTIVE",
  "ACTIVITY_ALERT_LOW",
  "ACTIVITY_ALERT_RECOMMEND_KICK",
  "ACTIVITY_ACTION_NOTIFY",
  "ACTIVITY_DIGEST",
] as const;

/** Extrait un userId acteur depuis le champ meta JSON d'un job */
function extractActorUserId(type: string, meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  // Ping batch → lancé par un staff
  if (type === "BANK_DEBT_PING_BATCH") return typeof m.createdByUserId === "string" ? m.createdByUserId : null;
  // Décision de recrutement → recruiter qui a clos le ticket
  if (type === "RECRUITMENT_DECISION") return typeof m.claimedByUserId === "string" ? m.claimedByUserId : null;
  return null;
}

/** Extrait un nom acteur direct depuis le champ meta (sans passer par la DB) */
function extractActorName(type: string, meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  // Sanction notify/apply → staffName enregistré au moment de l'action
  if (type === "SANCTION_NOTIFY" || type === "SANCTION_APPLY") {
    return typeof m.staffName === "string" && m.staffName ? m.staffName : null;
  }
  return null;
}

function parsePageParams(searchParams: URLSearchParams) {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Math.min(Math.max(Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function isValidStatus(value: string | null) {
  return value ? STATUSES.includes(value as (typeof STATUSES)[number]) : true;
}

function isValidType(value: string | null) {
  return value ? TYPES.includes(value as (typeof TYPES)[number]) : true;
}

export async function GET(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get("familyId") ?? "esperados";
  const status = searchParams.get("status");
  const type = searchParams.get("type");

  if (!isValidStatus(status)) {
    return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
  }
  if (!isValidType(type)) {
    return NextResponse.json({ ok: false, error: "INVALID_TYPE" }, { status: 400 });
  }

  const { page, pageSize, skip } = parsePageParams(searchParams);

  const where: any = { familyId };
  if (status) where.status = status;
  if (type) where.type = type;

  const [data, total] = await Promise.all([
    prisma.discordOutbox.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.discordOutbox.count({ where }),
  ]);

  // Résoudre le vrai familyId (cuid) depuis le slug pour les requêtes Member
  let memberFamilyId: string;
  try {
    memberFamilyId = await resolveFamilyId(familyId);
  } catch {
    memberFamilyId = familyId;
  }

  // Collecter tous les discordIds nécessaires (acteurs + cibles)
  const actorUserIds = new Set<string>();
  const targetDiscordIds = new Set<string>();
  for (const job of data) {
    const uid = extractActorUserId(job.type, job.meta);
    if (uid) actorUserIds.add(uid);
    if (job.userDiscordId) targetDiscordIds.add(job.userDiscordId);
  }

  // --- Résolution des acteurs ---
  const userLabelMap = new Map<string, string>();
  type UserRow = { id: string; name: string | null; email: string | null; accounts: { providerAccountId: string }[] };
  let actorUsers: UserRow[] = [];
  if (actorUserIds.size > 0) {
    actorUsers = await prisma.user.findMany({
      where: { id: { in: Array.from(actorUserIds) } },
      select: {
        id: true, name: true, email: true,
        accounts: {
          where: { provider: "discord" },
          select: { providerAccountId: true },
          take: 1,
        },
      },
    });
    for (const u of actorUsers) {
      const did = u.accounts[0]?.providerAccountId;
      if (did) targetDiscordIds.add(did);
      userLabelMap.set(u.id, u.name ?? u.email ?? u.id);
    }
  }

  // --- Résolution bulk des Members par discordId (acteurs + cibles) ---
  type MemberLabel = { rpName: string | null; discordDisplayName: string | null; discordUsername: string | null };
  const memberByDiscordId = new Map<string, MemberLabel>();
  const allDiscordIds = Array.from(targetDiscordIds);
  if (allDiscordIds.length > 0) {
    const members = await prisma.member.findMany({
      where: { familyId: memberFamilyId, discordId: { in: allDiscordIds } },
      select: { discordId: true, rpName: true, discordDisplayName: true, discordUsername: true },
    });
    for (const m of members) {
      if (m.discordId) memberByDiscordId.set(m.discordId, m);
    }
  }

  // Helper: meilleur label lisible depuis un Member
  function bestMemberLabel(m: MemberLabel | undefined): string | null {
    if (!m) return null;
    return m.rpName || m.discordDisplayName || m.discordUsername || null;
  }

  // Finaliser les labels acteurs avec rpName prioritaire
  for (const u of actorUsers) {
    const did = u.accounts[0]?.providerAccountId;
    const memberLabel = did ? bestMemberLabel(memberByDiscordId.get(did)) : null;
    userLabelMap.set(u.id, memberLabel || u.name || u.email || u.id);
  }

  // Helper: label lisible pour un discordId cible
  function targetLabel(discordId: string): string {
    const m = memberByDiscordId.get(discordId);
    return bestMemberLabel(m) || discordId;
  }

  // Enrichir chaque job avec actorLabel + targetLabel
  const enriched = data.map((job) => {
    // actorLabel
    const uid = extractActorUserId(job.type, job.meta);
    let actor: string;
    if (uid && userLabelMap.has(uid)) {
      actor = userLabelMap.get(uid)!;
    } else {
      actor = extractActorName(job.type, job.meta) ?? "Système";
    }

    // targetLabel
    let target: string;
    if (job.type === "ASSIGN_ROLE" || job.type === "REMOVE_ROLE") {
      target = job.userDiscordId ? targetLabel(job.userDiscordId) : "—";
    } else if (job.type === "BANK_DEBT_PING_SINGLE") {
      const p = job.meta as Record<string, unknown> | null;
      target = (p?.rpName as string) || (job.userDiscordId ? targetLabel(job.userDiscordId) : "—");
    } else if (job.type === "BANK_DEBT_PING_BATCH") {
      const p = job.meta as Record<string, unknown> | null;
      target = p?.threshold ? `Seuil ≥ ${Number(p.threshold).toLocaleString("fr-FR")} €` : "Groupe";
    } else if (job.type === "RECRUITMENT_DECISION") {
      const p = job.meta as Record<string, unknown> | null;
      target = (p?.candidateRpName as string) || (p?.candidateDiscordId ? targetLabel(p.candidateDiscordId as string) : "—");
    } else if (job.userDiscordId) {
      target = targetLabel(job.userDiscordId);
    } else if (job.channelId) {
      target = `Salon ${job.channelId}`;
    } else {
      target = "—";
    }

    return { ...job, actorLabel: actor, targetLabel: target };
  });

  return NextResponse.json({ ok: true, data: enriched, page, pageSize, total });
}

export async function PATCH(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
  }

  const updated = await prisma.discordOutbox.update({
    where: { id },
    data: { status: "CANCELED" },
  });

  return NextResponse.json({ ok: true, data: updated });
}
