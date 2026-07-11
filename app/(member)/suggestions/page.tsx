import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import { SuggestionsClient } from "./client";

export default async function SuggestionsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const linkedMember = await getMemberScopeOrNull(session);
  if (!linkedMember) redirect("/dashboard");

  return <SuggestionsClient />;
}
