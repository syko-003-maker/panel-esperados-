import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";

/** discordId du compte connecté (membre lié OU staff). null sinon. */
export async function resolveDiscordId(): Promise<string | null> {
  const session = await auth();
  if (!session) return null;
  const linked = await getMemberScopeOrNull(session);
  if (linked?.discordId) return linked.discordId;
  const sid = String((session as any)?.discordId ?? (session.user as any)?.discordId ?? "").trim();
  if (!sid) return null;
  const { canAccessStaffPanel } = await import("@/lib/rbac");
  const access = await canAccessStaffPanel(session).catch(() => null);
  return access?.canAccess ? sid : null;
}
