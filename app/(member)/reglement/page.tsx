import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import ReglementAssistant from "@/components/reglement/reglement-assistant";

export default async function ReglementPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const linkedMember = await getMemberScopeOrNull(session);
  if (!linkedMember) {
    redirect("/dashboard");
  }

  return <ReglementAssistant />;
}
