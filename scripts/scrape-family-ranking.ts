/**
 * Scraper du classement des familles LYG depuis liveyourgame.fr/stats.
 *
 * L'API LYG n'expose que points + banque ; le SCORE composite et les colonnes
 * de jeu (morts, or, cocaïne, guerres, réputation, membres actifs) ne vivent
 * que sur la page /stats, protégée Cloudflare. On la charge donc avec un vrai
 * Chromium (Playwright) qui exécute le challenge JS de Cloudflare, on ouvre
 * l'onglet Familles et on extrait le tableau complet.
 *
 * Robustesse :
 *  - contexte persistant (storageState) → on garde le cookie cf_clearance
 *    entre les runs, donc beaucoup moins de challenges ;
 *  - retry avec backoff ;
 *  - validation : on n'écrit le cache QUE si le scrape est cohérent
 *    (≥ MIN_FAMILIES avec un score) → jamais écraser de bonnes données par un
 *    scrape raté ;
 *  - écriture atomique (tmp + rename).
 *
 * Lancé périodiquement par le timer systemd `panel-family-scraper.timer`.
 * Le panel lit le JSON produit ; si absent/périmé il retombe sur le
 * classement par points de l'API (endpoint families-ranking).
 */
import { chromium, type BrowserContext } from "playwright";
import { promises as fs } from "node:fs";
import path from "node:path";

const STATS_URL = process.env.LYG_STATS_URL || "https://liveyourgame.fr/stats";
const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const OUT_FILE = path.join(CACHE_DIR, "lyg-family-ranking.json");
const STATE_FILE = path.join(CACHE_DIR, "lyg-pw-state.json");
const OUR_FAMILY_SLUG = "esperados";
const MIN_FAMILIES = 5;
const MAX_ATTEMPTS = 3;

type ScrapedFamily = {
  rank: number;
  name: string;
  slug: string;
  isOurs: boolean;
  score: string;
  scoreValue: number;
  membres: string;
  banque: string;
  braquages: string;
  morts: string;
  or: string;
  cocaine: string;
  guerres: string;
  reputation: string;
};

function parseFrNumber(s: string): number {
  const cleaned = (s || "").replace(/\s/g, "").replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

async function loadState(): Promise<string | undefined> {
  try {
    await fs.access(STATE_FILE);
    return STATE_FILE;
  } catch {
    return undefined;
  }
}

async function scrapeOnce(): Promise<ScrapedFamily[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  let ctx: BrowserContext | null = null;
  try {
    ctx = await browser.newContext({
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
      viewport: { width: 1400, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      storageState: await loadState(),
    });
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // Shim : tsx/esbuild (keepNames) peut injecter __name dans le code
      // sérialisé vers la page → on le neutralise pour éviter un ReferenceError.
      const g = globalThis as unknown as { __name?: (f: unknown) => unknown };
      if (!g.__name) g.__name = (f: unknown) => f;
    });
    const page = await ctx.newPage();
    await page.goto(STATS_URL, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Attendre la sortie du challenge Cloudflare / le montage de l'app.
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      if ((await page.locator("text=Familles").count().catch(() => 0)) > 0) {
        ready = true;
        break;
      }
      await page.waitForTimeout(1500);
    }
    if (!ready) throw new Error("app non montée (probable challenge Cloudflare persistant)");

    // Ouvrir l'onglet Familles.
    const famTab = page.locator("button:has-text('Familles'), [role=tab]:has-text('Familles')").first();
    if (!(await famTab.count())) throw new Error("onglet Familles introuvable");
    await famTab.click();
    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.waitForTimeout(1200);

    // Extraction passée en CHAÎNE brute (non transformée par tsx → pas de __name).
    const EXTRACT = `(() => {
      const t = document.querySelector('table');
      if (!t) return null;
      const norm = (s) => (s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[?\\s]/g, '').toLowerCase();
      const heads = Array.prototype.slice.call(t.querySelectorAll('thead th')).map(function (th) { return norm(th.textContent || ''); });
      const findIncl = (kw) => heads.findIndex((h) => h.indexOf(kw) !== -1);
      const findExact = (kw) => heads.findIndex((h) => h === kw);
      const rankIdx = heads.indexOf('#') >= 0 ? heads.indexOf('#') : 0;
      const idx = { rank: rankIdx, fam: findIncl('famille'), score: findIncl('score'), membres: findIncl('membre'), banque: findIncl('banque'), braquages: findIncl('braquage'), morts: findIncl('mort'), or: findExact('or'), cocaine: findIncl('cocaine'), guerres: findIncl('guerre'), reputation: findIncl('reputation') };
      const rows = Array.prototype.slice.call(t.querySelectorAll('tbody tr')).map(function (tr) {
        const tds = Array.prototype.slice.call(tr.querySelectorAll('td,th'));
        const cell = (i) => (i >= 0 && tds[i]) ? (tds[i].innerText || tds[i].textContent || '').trim() : '';
        return { rank: cell(idx.rank), famRaw: cell(idx.fam), score: cell(idx.score), membres: cell(idx.membres), banque: cell(idx.banque), braquages: cell(idx.braquages), morts: cell(idx.morts), or: cell(idx.or), cocaine: cell(idx.cocaine), guerres: cell(idx.guerres), reputation: cell(idx.reputation) };
      });
      return { heads: heads, rows: rows };
    })()`;
    const raw = (await page.evaluate(EXTRACT)) as {
      heads: string[];
      rows: Array<{
        rank: string; famRaw: string; score: string; membres: string; banque: string;
        braquages: string; morts: string; or: string; cocaine: string; guerres: string; reputation: string;
      }>;
    } | null;

    if (!raw || !raw.rows.length) throw new Error("tableau vide");

    const families: ScrapedFamily[] = raw.rows.map((r) => {
      const parts = (r.famRaw || "").split("\n").map((s) => s.trim()).filter(Boolean);
      const name = parts[0] || r.famRaw;
      const slug = (parts[1] || name).toLowerCase().replace(/\s+/g, "");
      return {
        rank: parseInt((r.rank || "").replace(/[^\d]/g, ""), 10) || 0,
        name,
        slug,
        isOurs: slug === OUR_FAMILY_SLUG || /esperados/i.test(r.famRaw),
        score: r.score,
        scoreValue: parseFrNumber(r.score),
        membres: r.membres,
        banque: r.banque,
        braquages: r.braquages,
        morts: r.morts,
        or: r.or,
        cocaine: r.cocaine,
        guerres: r.guerres,
        reputation: r.reputation,
      };
    });

    // Persister l'état (cookies cf_clearance) pour le prochain run.
    try {
      await ctx.storageState({ path: STATE_FILE });
    } catch {
      /* non bloquant */
    }
    return families;
  } finally {
    await browser.close();
  }
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  let families: ScrapedFamily[] = [];
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      families = await scrapeOnce();
      const valid = families.filter((f) => f.name && f.score).length;
      if (valid >= MIN_FAMILIES) break;
      throw new Error(`scrape incohérent (${valid} familles valides < ${MIN_FAMILIES})`);
    } catch (e) {
      lastErr = e;
      console.error(`[scrape] tentative ${attempt}/${MAX_ATTEMPTS} échouée:`, e instanceof Error ? e.message : e);
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 4000));
    }
  }

  const valid = families.filter((f) => f.name && f.score).length;
  if (valid < MIN_FAMILIES) {
    console.error("[scrape] ÉCHEC — on NE réécrit PAS le cache (on garde le dernier bon).", lastErr);
    process.exit(1);
  }

  const payload = {
    scrapedAt: new Date().toISOString(),
    source: STATS_URL,
    count: families.length,
    families,
  };
  const tmp = OUT_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(payload), "utf8");
  await fs.rename(tmp, OUT_FILE);
  const ours = families.find((f) => f.isOurs);
  console.log(
    `[scrape] OK — ${families.length} familles écrites. Los Esperados: #${ours?.rank} score ${ours?.score} · ${ours?.membres} membres.`
  );
}

main().catch((e) => {
  console.error("[scrape] erreur fatale:", e);
  process.exit(1);
});
