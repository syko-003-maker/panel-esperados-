import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import StaffLinkForm, { type Link } from "./StaffLinkForm";
import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { getDiscordIdFromSessionOrAccount } from "@/lib/me";

const DEFAULT_FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

function toPlain(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    (value as any).constructor?.name === "Decimal" &&
    typeof (value as any).toString === "function"
  ) {
    return (value as any).toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item));
  }
  if (typeof value === "object" && value !== null) {
    const plain: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      plain[key] = toPlain(entry);
    }
    return plain;
  }
  return value;
}

/**
 * ✅ PATCH: /staff/link IDEMPOTENT
 * - Si déjà lié (member avec steamId) -> redirect /me
 * - Sinon -> afficher formulaire de liaison
 * - Garantit anti-boucle
 */
export default async function StaffLinkPage() {
  const guard = await requirePrivileged();

  // ✅ Server Component ne doit pas return Response
  if (guard instanceof Response) {
    redirect("/api/auth/signin");
  }

  // ✅ IDEMPOTENCE: Si déjà lié -> redirect /me
  const session = await getSession();
  const discordId = await getDiscordIdFromSessionOrAccount(session);

  if (discordId) {
    const existingMember = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: DEFAULT_FAMILY_ID, discordId } },
      select: { id: true, steamId: true },
    });

    if (existingMember && existingMember.steamId) {
      // ✅ LOG DEBUG
      console.log("[staff/link:page] already linked memberId:", existingMember.id, "-> redirect /me");
      redirect("/me");
    }
  }

  const links = await prisma.member.findMany({
    where: { familyId: DEFAULT_FAMILY_ID },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      discordId: true,
      steamId: true,
      rpName: true,
      grade: true,
      gradeLevel: true,
      roleDiscordId: true,
      isActive: true,
      joinedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const initialLinks = links.map((link) => toPlain(link)) as Link[];

  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <h1>Liaison</h1>
      <StaffLinkForm initialLinks={initialLinks} />
    </div>
  );
}
