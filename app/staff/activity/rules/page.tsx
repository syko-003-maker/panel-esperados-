import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { ActivityRulesClient } from "./rules-client";

export default async function ActivityRulesPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const user = session.user as any;
  if (!user?.isStaff) {
    redirect("/");
  }

  // Check if admin (only admins can manage rules)
  const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "").split(",").filter(Boolean);
  const isAdmin = user.isAdmin || (user.discordId && adminIds.includes(user.discordId));

  if (!isAdmin) {
    redirect("/staff/activity");
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Règles d'activité</h1>
      <ActivityRulesClient />
    </div>
  );
}
