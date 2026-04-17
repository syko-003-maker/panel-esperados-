import { NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { prisma } from "@/lib/db";

const DEFAULT_TEMPLATES = [
  {
    key: "recruitment.submitted",
    title: "Recrutement soumis",
    content: "📥 Nouvelle candidature reçue\n\n👤 {{rpName}} (<@{{discordId}}>)\n🎮 Steam : {{steamId}}\n🎂 Âge : {{age}}",
  },
  {
    key: "recruitment.accepted",
    title: "Recrutement accepté",
    content: "✅ Candidature acceptée\n\n👤 {{rpName}} (<@{{discordId}}>)\n🎮 Steam : {{steamId}}\n\nBienvenue dans la famille !",
  },
  {
    key: "recruitment.rejected",
    title: "Recrutement refusé",
    content: "❌ Candidature refusée\n\n👤 {{rpName}} (<@{{discordId}}>)\n🎮 Steam : {{steamId}}",
  },
  {
    key: "complaint.created",
    title: "Plainte créée",
    content: "📋 Nouvelle plainte — {{title}}\n\nPlaignant : <@{{complainantId}}>\nContre : <@{{targetId}}>",
  },
  {
    key: "sanction.created",
    title: "Sanction appliquée",
    content: "⚠️ Sanction appliquée — {{type}}\n\nMembre : <@{{discordId}}>\nMotif : {{reason}}\nPoints : {{points}}",
  },
  {
    key: "absence.requested",
    title: "Absence demandée",
    content: "📅 Absence déclarée\n\nMembre : <@{{discordId}}>\nDu {{startAt}} au {{endAt}}",
  },
  {
    key: "ME_ABSENCE_CREATED",
    title: "Absence créée (membre)",
    content: "📅 Absence enregistrée\n\nMembre : <@{{discordId}}>\nDu {{startAt}} au {{endAt}}",
  },
  {
    key: "absence_justification_created",
    title: "Justificatif d'absence",
    content: "📎 Justificatif d'absence soumis\n\nMembre : <@{{discordId}}>",
  },
  {
    key: "ME_ABSENCE_JUSTIFIED",
    title: "Absence justifiée (membre)",
    content: "📎 Justificatif d'absence soumis\n\nMembre : <@{{discordId}}>\nMessage : {{message}}",
  },
  {
    key: "sanction_justification_created",
    title: "Justificatif de sanction",
    content: "📎 Justificatif de sanction soumis\n\nMembre : <@{{discordId}}>",
  },
  {
    key: "ME_SANCTION_JUSTIFIED",
    title: "Sanction justifiée (membre)",
    content: "📎 Justificatif de sanction soumis\n\nMembre : <@{{discordId}}>\nMessage : {{message}}",
  },
  {
    key: "BANK_DEBT_PING_SINGLE",
    title: "Rappel de dette",
    content: "{{mention}} tu es actuellement en déficit de **{{deficitAmountFormatted}}** sur le compte bancaire de la famille.\n\nMerci de régulariser ta situation dans les plus brefs délais. En cas de problème, contacte un État-Major.",
  },
  {
    key: "absence.approved",
    title: "Absence approuvée",
    content: "✅ Absence approuvée\n\nMembre : <@{{discordId}}>\nDu {{startAt}} au {{endAt}}",
  },
  {
    key: "meeting.scheduled",
    title: "Réunion programmée",
    content: "📅 Réunion programmée — {{title}}\n\nRendez-vous le {{scheduledAt}}",
  },
] as const;

// Contenus anglais d'origine : si un template en DB correspond encore à ce contenu,
// il est migré vers le contenu français par défaut lors du prochain appel à ensureDefaults.
// Cela ne touche jamais les templates personnalisés par le staff.
const LEGACY_CONTENT_MAP: Record<string, string> = {
  "recruitment.submitted":          "New recruitment: {{discordId}} steam: {{steamId}} rp: {{rpName}} age: {{age}}",
  "recruitment.accepted":           "Recruitment accepted: {{discordId}} rp: {{rpName}} steam: {{steamId}}",
  "recruitment.rejected":           "Recruitment rejected: {{discordId}} rp: {{rpName}} steam: {{steamId}}",
  "complaint.created":              "New complaint: {{title}} ({{complainantId}} -> {{targetId}})",
  "sanction.created":               "Sanction {{type}} for {{discordId}}: {{reason}} (points: {{points}})",
  "absence.requested":              "Absence requested: {{discordId}} from {{startAt}} to {{endAt}}",
  "ME_ABSENCE_CREATED":             "Member absence: {{discordId}} from {{startAt}} to {{endAt}}",
  "absence_justification_created":  "Absence justification by {{discordId}} for {{absenceId}}",
  "ME_ABSENCE_JUSTIFIED":           "Absence justification by {{discordId}} for {{absenceId}}: {{message}}",
  "sanction_justification_created": "Sanction justification by {{discordId}} for {{sanctionId}}",
  "ME_SANCTION_JUSTIFIED":          "Sanction justification by {{discordId}} for {{sanctionId}}: {{message}}",
  "BANK_DEBT_PING_SINGLE":          "{{mention}} Tu es en deficit de {{deficitAmountFormatted}}. Merci de rembourser rapidement.",
  "absence.approved":               "Absence approved: {{discordId}} from {{startAt}} to {{endAt}}",
  "meeting.scheduled":              "Meeting scheduled: {{title}} at {{scheduledAt}}",
};

async function ensureDefaults(familyId: string) {
  const existing = await prisma.discordTemplate.findMany({
    where: { familyId },
    select: { key: true, content: true, title: true },
  });

  const existingMap = new Map(existing.map((t) => [t.key, t]));

  // Créer les templates manquants
  const missing = DEFAULT_TEMPLATES.filter((t) => !existingMap.has(t.key));
  if (missing.length > 0) {
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

  // Migrer les templates qui ont encore le contenu anglais d'origine (non personnalisés)
  const newDefaults = new Map<string, { key: string; title: string; content: string }>(DEFAULT_TEMPLATES.map((t) => [t.key, t]));
  const toMigrate = existing.filter((row) => {
    const legacy = LEGACY_CONTENT_MAP[row.key];
    return legacy && row.content === legacy;
  });

  if (toMigrate.length > 0) {
    await Promise.all(
      toMigrate.map((row) => {
        const newDef = newDefaults.get(row.key);
        if (!newDef) return Promise.resolve();
        return prisma.discordTemplate.update({
          where: { familyId_key: { familyId, key: row.key } },
          data: { content: newDef.content, title: newDef.title },
        });
      })
    );
  }
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
