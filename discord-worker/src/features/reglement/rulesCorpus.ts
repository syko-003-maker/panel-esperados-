/**
 * Corpus du règlement LYG pour la commande /reglement (Q&A IA).
 *
 * Sources :
 *  - 3 pages liveyourgame.fr (contenu embarqué dans le payload Nuxt, encodé
 *    JSON + entités HTML → on déséchappe puis on strip les balises)
 *  - 1 Google Doc (règlement gendarmerie) exporté en texte brut
 *
 * Le corpus est mis en cache sur disque (data/reglement-corpus.json) et
 * rafraîchi au plus toutes les 24 h. En cas d'échec réseau, on sert le
 * dernier cache connu — le bot ne doit jamais être muet à cause d'un 500 LYG.
 */

import fs from "fs";
import path from "path";

const SOURCES: Array<{ title: string; url: string; kind: "lyg" | "gdoc" }> = [
  { title: "RÈGLES DARKRP (règlement général serveur)", url: "https://liveyourgame.fr/rules/regles-darkrp", kind: "lyg" },
  { title: "RÈGLES MÉTIERS", url: "https://liveyourgame.fr/rules/regles-metiers", kind: "lyg" },
  { title: "RÈGLES STAFF", url: "https://liveyourgame.fr/rules/regles-staffs", kind: "lyg" },
  {
    title: "RÈGLEMENT GENDARMERIE",
    url: "https://docs.google.com/document/d/1QAnvraYJ7gXQYgOu7Mt2dnai0w_7yW2z-DmTBz_7QXY/export?format=txt",
    kind: "gdoc",
  },
];

const CACHE_FILE = path.join(process.cwd(), "data", "reglement-corpus.json");
const REFRESH_MS = 24 * 60 * 60 * 1000; // 24 h

type CorpusCache = { fetchedAt: number; corpus: string };

let memoryCache: CorpusCache | null = null;
let refreshInFlight: Promise<string> | null = null;

/** Extrait le texte lisible d'une page LYG (payload Nuxt JSON-échappé). */
function cleanLygHtml(html: string): string {
  let s = html;
  // Déséchappement JSON (é → é, \/ → /, \" → ", \n → saut de ligne)
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/\\\//g, "/").replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, " ");
  // Entités HTML, deux passes (&amp;lt; → &lt; → <)
  const decode = (t: string) =>
    t
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  s = decode(decode(s));
  // Sauts de ligne sur les fins de blocs, puis strip de toutes les balises
  s = s.replace(/<\/(p|li|h[1-6]|div|tr)>/gi, "\n").replace(/<(br|hr)[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  // Filtrage du bruit JS/CSS/JSON ligne par ligne
  const lines = s
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => {
      if (l.length < 4) return false;
      if (/[{}<>]|function|window\.|=>|px;|rgb\(|color:|font-|class=|http|\\u00|^[\d\W]+$/.test(l)) return false;
      const letters = (l.match(/[a-zA-Zà-ÿÀ-Ÿ]/g) || []).length;
      return letters / l.length > 0.6;
    });
  // Dédoublonnage (le payload Nuxt duplique certains fragments)
  return [...new Set(lines)].join("\n");
}

function cleanGdocText(text: string): string {
  return text
    .replace(/^﻿/, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join("\n")
    .replace(/_{5,}/g, "—");
}

async function fetchSource(src: (typeof SOURCES)[number]): Promise<string> {
  const res = await fetch(src.url, {
    headers: { "user-agent": "Mozilla/5.0 (LosEsperados-ReglementBot)" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`${src.url} → HTTP ${res.status}`);
  const raw = await res.text();
  const text = src.kind === "lyg" ? cleanLygHtml(raw) : cleanGdocText(raw);
  if (text.length < 500) throw new Error(`${src.url} → extraction trop courte (${text.length} car.)`);
  return text;
}

async function buildCorpus(): Promise<string> {
  const parts: string[] = [];
  const errors: string[] = [];
  for (const src of SOURCES) {
    try {
      const text = await fetchSource(src);
      parts.push(`========== ${src.title} ==========\nSource : ${src.url.split("/export")[0]}\n\n${text}`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (parts.length === 0) {
    throw new Error(`Aucune source de règlement récupérable: ${errors.join(" | ")}`);
  }
  if (errors.length > 0) {
    console.warn("[reglement] sources partielles:", errors.join(" | "));
  }
  return parts.join("\n\n");
}

function loadDiskCache(): CorpusCache | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as CorpusCache;
    if (parsed && typeof parsed.corpus === "string" && parsed.corpus.length > 1000) return parsed;
  } catch {
    /* pas de cache */
  }
  return null;
}

function saveDiskCache(cache: CorpusCache): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch (err) {
    console.warn("[reglement] écriture cache impossible:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Renvoie le corpus complet du règlement. Frais si possible, sinon le dernier
 * cache connu (disque), sinon throw.
 */
export async function getRulesCorpus(): Promise<string> {
  if (!memoryCache) memoryCache = loadDiskCache();

  const fresh = memoryCache && Date.now() - memoryCache.fetchedAt < REFRESH_MS;
  if (memoryCache && fresh) return memoryCache.corpus;

  // Refresh nécessaire — une seule course à la fois.
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const corpus = await buildCorpus();
        memoryCache = { fetchedAt: Date.now(), corpus };
        saveDiskCache(memoryCache);
        console.log(`[reglement] corpus rafraîchi (${corpus.length} caractères)`);
        return corpus;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  try {
    return await refreshInFlight;
  } catch (err) {
    // Échec réseau : on sert le cache périmé plutôt que rien.
    if (memoryCache) {
      console.warn("[reglement] refresh échoué, cache périmé servi:", err instanceof Error ? err.message : String(err));
      return memoryCache.corpus;
    }
    throw err;
  }
}
