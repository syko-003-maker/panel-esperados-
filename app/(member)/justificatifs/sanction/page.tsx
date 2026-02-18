import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import { SanctionPageClient } from "./client";

export default async function SanctionPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const linkedMember = await getMemberScopeOrNull(session);
  if (!linkedMember) {
    redirect("/dashboard");
  }

  return <SanctionPageClient />;
}
