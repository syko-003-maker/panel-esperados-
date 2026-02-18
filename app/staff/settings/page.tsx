import { requireStaffFull } from "@/lib/guards";
import { redirect } from "next/navigation";
import SettingsClient from "./SettingsClient";

export default async function Page() {
  const guard = await requireStaffFull();

  if (guard instanceof Response) {
    if (guard.status === 401) redirect("/api/auth/signin");
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Accès refusé</h1>
        <p style={{ marginTop: 8 }}>Cette page est réservée aux administrateurs staff.</p>
      </div>
    );
  }

  return <SettingsClient />;
}
