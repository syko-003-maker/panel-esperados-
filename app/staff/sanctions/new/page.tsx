import { redirect } from "next/navigation";

export default async function NewSanctionPage() {
  redirect("/staff/sanctions");
}
