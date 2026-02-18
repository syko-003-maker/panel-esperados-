import { requireChef } from "@/lib/guards";
import { redirect } from "next/navigation";
import { ConfigClient } from "./config-client";

export default async function ConfigPage() {
  const guard = await requireChef();
  if (guard instanceof Response) {
    // Guard returned Response - redirect to appropriate page
    const status = guard.status;
    if (status === 401) {
      redirect("/api/auth/signin");
    } else {
      redirect("/staff/forbidden");
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Configuration & Feature Flags</h1>
      <ConfigClient />
    </div>
  );
}
