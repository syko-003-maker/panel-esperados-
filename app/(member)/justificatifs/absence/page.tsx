import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import { AbsencePageClient } from "./client";

export default async function AbsencePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const linkedMember = await getMemberScopeOrNull(session);
  if (!linkedMember) {
    redirect("/dashboard");
  }

  return <AbsencePageClient />;
}

