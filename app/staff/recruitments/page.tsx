import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { extractRecruitmentEvaluation, parseRecruitmentNotes } from "@/lib/recruitment/legacy";
import { resolveModelForRecruitment } from "@/lib/recruitment/models";
import { computeRecruitmentTotals } from "@/lib/recruitment/scoring";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";
import { RecruitmentsListClient } from "./recruitments-list-client";
import { PageShell } from "@/components/staff/ui";
import { Users } from "lucide-react";

export default async function RecruitmentsPage() {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  const recruitments = await prisma.recruitment.findMany({
    where: {
      familyId: familyDbId,
      ticketKey: { not: null },
    },
    orderBy: [
      { closedAt: "asc" }, // OPEN first (null closedAt)
      { createdAt: "desc" },
    ],
    take: 200,
  });

  // Résoudre les noms des recruteurs depuis notes.claimedById (userId NextAuth)
  // Priorité : rpName (Member) > displayName Discord > username Discord
  const allNotes = recruitments.map((r) => parseRecruitmentNotes(r.notes ?? null));
  const claimedUserIds = [...new Set(
    allNotes.map((n) => n.claimedById).filter((id): id is string => Boolean(id))
  )];
  const claimedUsers = claimedUserIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: claimedUserIds } },
        select: { id: true, name: true, image: true },
      })
    : [];
  // userId → discordId via Account
  const accounts = claimedUserIds.length > 0
    ? await prisma.account.findMany({
        where: { userId: { in: claimedUserIds }, provider: "discord" },
        select: { userId: true, providerAccountId: true },
      })
    : [];
  const discordIdByUserId = new Map(accounts.map((a) => [a.userId, a.providerAccountId]));
  // discordId → rpName via Member
  const claimedDiscordIds = [...new Set(accounts.map((a) => a.providerAccountId))];
  const claimedMembers = claimedDiscordIds.length > 0
    ? await prisma.member.findMany({
        where: { discordId: { in: claimedDiscordIds } },
        select: { discordId: true, rpName: true, discordAvatarHash: true },
      })
    : [];
  const rpNameByDiscordId = new Map(
    claimedMembers.filter((m): m is typeof m & { discordId: string } => Boolean(m.discordId))
      .map((m) => [m.discordId, m.rpName])
  );
  const userNameMap = new Map(claimedUsers.map((u) => {
    const discordId = discordIdByUserId.get(u.id);
    const rpName = discordId ? rpNameByDiscordId.get(discordId) : null;
    return [u.id, rpName ?? u.name ?? null];
  }));
  // Avatar : on privilégie le hash Member (tenu à jour par la sync) plutôt que
  // User.image (figé au moment du login OAuth, souvent absent/périmé).
  const avatarHashByDiscordId = new Map(
    claimedMembers
      .filter((m): m is typeof m & { discordId: string } => Boolean(m.discordId))
      .map((m) => [m.discordId, m.discordAvatarHash])
  );
  const userAvatarMap = new Map(claimedUsers.map((u) => {
    const discordId = discordIdByUserId.get(u.id) ?? null;
    const hash = discordId ? (avatarHashByDiscordId.get(discordId) ?? null) : null;
    return [u.id, getDiscordAvatarUrl(discordId, hash) ?? u.image ?? null];
  }));

  // Note du candidat, pour l'afficher sous chaque recruteur.
  //
  // On ne peut PAS se contenter du barème par défaut : les points sont indexés
  // sur les identifiants de questions, donc un ticket évalué avec un autre
  // modèle donnerait une note fausse. On résout donc le modèle de chaque ticket
  // — en le mettant en cache, car beaucoup de tickets partagent le même.
  const modelCache = new Map<string, Awaited<ReturnType<typeof resolveModelForRecruitment>>>();
  const scoreByRecruitmentId = new Map<string, number | null>();

  for (let i = 0; i < recruitments.length; i++) {
    const notes = allNotes[i];
    const evaluation = extractRecruitmentEvaluation(notes, recruitments[i].payload);

    // Aucune évaluation saisie : pas de note à afficher (≠ note de zéro).
    if (!evaluation.scoresJson || Object.keys(evaluation.scoresJson).length === 0) {
      scoreByRecruitmentId.set(recruitments[i].id, null);
      continue;
    }

    const key = notes.modelId ?? "__default__";
    let model = modelCache.get(key);
    if (!model) {
      model = await resolveModelForRecruitment(notes.modelId ?? null);
      modelCache.set(key, model);
    }

    scoreByRecruitmentId.set(
      recruitments[i].id,
      computeRecruitmentTotals(evaluation.scoresJson, model.questions).totalOn20
    );
  }

  const data = recruitments.map((r, i) => {
    const notes = allNotes[i];
    const claimedById = notes.claimedById ?? null;
    return {
      score: scoreByRecruitmentId.get(r.id) ?? null,
      id: r.id,
      ticketKey: r.ticketKey!,
      status: r.status,
      authorDiscordId: r.discordId,
      authorTag: r.authorTag,
      steamId: r.steamId,
      rpName: r.rpName,
      threadId: r.discordThreadId,
      createdAt: r.createdAt.toISOString(),
      closedAt: r.closedAt?.toISOString() ?? null,
      claimedByName: claimedById ? (userNameMap.get(claimedById) ?? null) : null,
      claimedByAvatar: claimedById ? (userAvatarMap.get(claimedById) ?? null) : null,
    };
  });

  return (
    <PageShell
      title="Recrutements"
      description="Gestion des candidatures reçues depuis Discord et accès rapide aux dossiers ouverts."
      icon={Users}
    >
      <RecruitmentsListClient recruitments={data} />
    </PageShell>
  );
}
