import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { auth } from "@/auth";
import { fetchFamiliesRanking } from "@/lib/lyg/client";

/**
 * GET /api/member/families-ranking — classement des familles LYG.
 *
 * Source principale : le fichier `.cache/lyg-family-ranking.json` produit par
 * le scraper (`scripts/scrape-family-ranking.ts`, timer systemd) qui lit la
 * page liveyourgame.fr/stats via Playwright → on a le VRAI score composite +
 * toutes les colonnes (membres, banque, braquages, morts, or, cocaïne,
 * guerres, réputation).
 *
 * Fallback : si le scrape est absent/illisible, on retombe sur l'API LYG
 * `/api/darkrp/familles` (points + banque uniquement) → classement dégradé
 * mais jamais cassé (source: "api-fallback").
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUR_FAMILY_ID = "esperados";
const CACHE_FILE = path.resolve(process.cwd(), ".cache", "lyg-family-ranking.json");
const MEM_CACHE_MS = 60_000;
const STALE_AFTER_MS = 90 * 60_000; // au-delà, on garde les données mais on flag stale

type RichFamily = {
  rank: number;
  name: string;
  slug: string;
  isOurs: boolean;
  score: string;
  membres: string;
  banque: string;
  braquages: string;
  morts: string;
  or: string;
  cocaine: string;
  guerres: string;
  reputation: string;
};
type Payload = {
  ok: true;
  source: "scrape" | "api-fallback";
  scrapedAt: string | null;
  stale: boolean;
  totalFamilies: number;
  ours: RichFamily | null;
  ranking: RichFamily[];
};

let mem: { at: number; payload: Payload } | null = null;

function formatMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 €";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M €`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")} k €`;
  return `${n} €`;
}

async function readScrape(): Promise<{ scrapedAt: string; families: RichFamily[] } | null> {
  try {
    const txt = await fs.readFile(CACHE_FILE, "utf8");
    const data = JSON.parse(txt);
    if (!data || !Array.isArray(data.families) || data.families.length === 0) return null;
    return { scrapedAt: String(data.scrapedAt ?? ""), families: data.families as RichFamily[] };
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (mem && Date.now() - mem.at < MEM_CACHE_MS) {
    return NextResponse.json({ ...mem.payload, cachedAt: mem.at });
  }

  // 1) Source principale : données scrapées (vrai score + toutes colonnes).
  const scrape = await readScrape();
  if (scrape) {
    const ranking = [...scrape.families]
      .sort((a, b) => (a.rank || 999) - (b.rank || 999))
      .map((f) => ({ ...f, isOurs: f.slug === OUR_FAMILY_ID || Boolean(f.isOurs) }));
    const ours = ranking.find((f) => f.isOurs) ?? null;
    const ageMs = scrape.scrapedAt ? Date.now() - Date.parse(scrape.scrapedAt) : Infinity;
    const payload: Payload = {
      ok: true,
      source: "scrape",
      scrapedAt: scrape.scrapedAt || null,
      stale: !(ageMs < STALE_AFTER_MS),
      totalFamilies: ranking.length,
      ours,
      ranking,
    };
    mem = { at: Date.now(), payload };
    return NextResponse.json({ ...payload, cachedAt: mem.at });
  }

  // 2) Fallback API (points + banque seulement).
  const res = await fetchFamiliesRanking();
  if (!res.ok || !res.data || res.data.length === 0) {
    if (mem) return NextResponse.json({ ...mem.payload, stale: true, cachedAt: mem.at });
    return NextResponse.json({ ok: false, error: "LYG_UNAVAILABLE" });
  }
  const ranking: RichFamily[] = [...res.data]
    .sort((a, b) => b.points - a.points)
    .map((f, i) => ({
      rank: i + 1,
      name: f.name,
      slug: f.id,
      isOurs: f.id === OUR_FAMILY_ID,
      score: "", // le vrai score n'est dispo que via le scrape
      membres: "",
      banque: formatMoney(f.money),
      braquages: "",
      morts: "",
      or: "",
      cocaine: "",
      guerres: "",
      reputation: "",
    }));
  const ours = ranking.find((f) => f.isOurs) ?? null;
  const payload: Payload = {
    ok: true,
    source: "api-fallback",
    scrapedAt: null,
    stale: false,
    totalFamilies: ranking.length,
    ours,
    ranking,
  };
  mem = { at: Date.now(), payload };
  return NextResponse.json({ ...payload, cachedAt: mem.at });
}
