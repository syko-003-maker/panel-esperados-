import { NextResponse } from "next/server";
import { FAMILY_SLUG } from "@/lib/family";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { fetchWithTimeout } from "@/lib/http";

/** Appel LYG : 15 s, valeur deja utilisee ailleurs dans le projet. */
const LYG_TIMEOUT_MS = 15_000;

type Context = {
  params: Promise<{
    familyId: string;
  }>;
};

export async function GET(req: Request, context: Context) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;
  const { familyId: receivedFamilyId } = await context.params;

  // CRITICAL: Force SLUG ONLY - reject or warn if different
  if (receivedFamilyId && receivedFamilyId !== FAMILY_SLUG) {
    console.warn("[LYG ROUTE SECURITY] Invalid familyId parameter (ignoring)", {
      received: receivedFamilyId,
      enforced: FAMILY_SLUG,
      timestamp: new Date().toISOString(),
    });
  }

  // ALWAYS use enforced slug, never use dynamic parameter
  const familySlug = FAMILY_SLUG;
  const url = `https://api.lyg.fr/api/familles/${encodeURIComponent(
    familySlug
  )}/members`;

  console.log("[LYG CALL] members endpoint from route", {
    paramReceived: receivedFamilyId,
    enforced: familySlug,
    url,
    timestamp: new Date().toISOString(),
  });

  try {
    // On forward les headers utiles si besoin (ex: Authorization)
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    const auth = req.headers.get("authorization");
    if (auth) headers.Authorization = auth;

    const res = await fetchWithTimeout(url, {
      method: "GET",
      headers,
      cache: "no-store",
      timeoutMs: LYG_TIMEOUT_MS,
    });

    const text = await res.text();

    // Essaye JSON, sinon renvoie brut (utile si l'API renvoie autre chose)
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json(
      { error: "FETCH_FAILED", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
