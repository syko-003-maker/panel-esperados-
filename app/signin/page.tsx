import { redirect } from "next/navigation";

type SignInPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function SignInPage({ searchParams }: SignInPageProps) {
  const params = new URLSearchParams();

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else if (value) {
        params.set(key, value);
      }
    }
  }

  const query = params.toString();
  redirect(query ? `/login?${query}` : "/login");
}
