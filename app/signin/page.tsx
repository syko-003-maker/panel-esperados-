import { redirect } from "next/navigation";

type SignInPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = new URLSearchParams();
  const resolved = (await searchParams) ?? {};

  for (const [key, value] of Object.entries(resolved)) {
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  redirect(query ? `/login?${query}` : "/login");
}
