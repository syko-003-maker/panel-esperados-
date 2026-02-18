import { redirect } from "next/navigation";
import { getSession } from "@/auth";

export default async function AdminPage() {
  const session = await getSession();
  if (!session?.user) redirect("/");

  const roles = ((session as any).roles ?? (session.user as any)?.roles ?? []) as string[];
  const isStaff = Boolean(
    (session as any).isStaff ?? (session.user as any)?.isStaff ?? (session.user as any)?.isPrivileged
  );

  if (!roles.includes(process.env.ROLE_CHEF ?? "") && !isStaff) {
    redirect("/dashboard");
  }

  return (
    <div style={{ color: "white", padding: 24 }}>
      <h1>Admin — Chef de famille</h1>
      <p>Accès exclusif Chef</p>
    </div>
  );
}
