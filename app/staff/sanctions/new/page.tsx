import { redirect } from "next/navigation";
import { requireChefOrEtatMajor } from "@/lib/guards";
import NewSanctionClient from "./new-sanction-client";

export default async function NewSanctionPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-4">Nouvelle sanction</h1>
      <NewSanctionClient />
    </div>
  );
}
