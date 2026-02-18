import { requireStaffFull } from "@/lib/guards";
import { redirect } from "next/navigation";
import DiscordOutboxClient from "../../discord/outbox/outbox-client";

export default async function StaffSettingsOutboxPage() {
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

  return (
    <div style={{ padding: 24 }}>
      <h1>Discord Outbox</h1>
      <DiscordOutboxClient />
    </div>
  );
}
