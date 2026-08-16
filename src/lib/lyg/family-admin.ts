import "server-only";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto-secret";
import { logInfo } from "@/lib/obs";

/**
 * Observation brute des réponses de families.lyg.fr.
 *
 * Le succès est aujourd'hui déduit du seul code HTTP (`302 || 200`). Or sur les
 * 23 actions manuelles enregistrées entre le 25/05 et le 11/08/2026, LYG a
 * répondu 302 dans 100 % des cas — succès comme échec éventuel. Le code ne
 * saurait donc pas distinguer une opération réellement effectuée d'un simple
 * retour au formulaire.
 *
 * `callLygAdmin` capture déjà `location` et `bodyText`, mais les jette. On se
 * contente ici de les journaliser : de quoi établir plus tard, sur des réponses
 * RÉELLES, la règle qui distingue succès et échec — plutôt que de la deviner
 * maintenant sans avoir jamais observé un échec.
 *
 * Aucune décision n'est prise à partir de ces valeurs à ce stade.
 */
const OBSERVED_BODY_MAX_CHARS = 200;

/** Neutralise tout ce qui ressemble à un identifiant de session dans une trace. */
function redactSecrets(value: string): string {
  return value
    .replace(/PHPSESSID\s*=\s*[^;\s"'&]+/gi, "PHPSESSID=[redacted]")
    .replace(/\b(token|session|auth|csrf)\s*=\s*[^;\s"'&]+/gi, "$1=[redacted]");
}

/** Extrait compact et sûr du corps HTML : sans saut de ligne, tronqué, expurgé. */
function summarizeBody(bodyText: string): string {
  const flat = bodyText.replace(/\s+/g, " ").trim();
  const cut = flat.slice(0, OBSERVED_BODY_MAX_CHARS);
  return redactSecrets(cut);
}

/**
 * Client proxy pour le site admin families.lyg.fr.
 *
 * L'API publique LYG (api.lyg.fr) n'expose pas d'endpoint write pour la
 * gestion famille. On contourne en agissant comme un navigateur connecté :
 *   - On stocke le cookie PHPSESSID que le Chef famille colle dans le panel
 *   - À chaque action, on appelle directement families.lyg.fr/modules/edit.php
 *     avec ce cookie
 *
 * Endpoints découverts (cf. captures cURL DevTools) :
 *   Up      : GET  /modules/edit.php?steamid=X&type=up&class=N
 *   Down    : GET  /modules/edit.php?steamid=X&type=down&class=N
 *   Delete  : GET  /modules/edit.php?steamid=X&type=del
 *   Add     : POST /modules/edit.php   body: steamid=X
 *
 * Auth   : Cookie PHPSESSID=...
 * Succès : status 302 (redirect vers dashboard.php)
 * Échec  : status 302 vers /login (cookie expiré) ou >=400
 */

const FAMILY_ADMIN_BASE = "https://families.lyg.fr";
const FAMILY_ADMIN_PATH = "/modules/edit.php";

const COMMON_HEADERS = {
  // On se fait passer pour un navigateur récent (Edge sur Win) pour ne pas
  // déclencher un éventuel filtre user-agent.
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
  Referer: `${FAMILY_ADMIN_BASE}/pages/dashboard.php`,
  Origin: FAMILY_ADMIN_BASE,
} as const;

export type LygFamilyActionType = "up" | "down" | "del" | "add";

export type LygFamilyActionResult =
  | { ok: true; status: number; tookMs: number }
  | { ok: false; status: number; tookMs: number; error: string; expired: boolean };

/** Détection de "session expirée" : redirect vers /login. */
function detectExpiry(status: number, locationHeader: string | null): boolean {
  if (status === 401 || status === 403) return true;
  if (status === 302 || status === 301) {
    const loc = (locationHeader ?? "").toLowerCase();
    if (loc.includes("login") || loc.includes("auth") || loc.includes("connexion")) {
      return true;
    }
  }
  return false;
}

async function callLygAdmin(opts: {
  cookie: string;
  method: "GET" | "POST";
  query?: Record<string, string>;
  body?: Record<string, string>;
}): Promise<{
  status: number;
  location: string | null;
  expired: boolean;
  bodyText: string;
}> {
  const url = new URL(FAMILY_ADMIN_PATH, FAMILY_ADMIN_BASE);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {
    ...COMMON_HEADERS,
    Cookie: `PHPSESSID=${opts.cookie}`,
  };
  if (opts.method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const body =
    opts.method === "POST" && opts.body
      ? new URLSearchParams(opts.body).toString()
      : undefined;

  // IMPORTANT : redirect:"manual" pour OBSERVER les 302 (succès=302 vers
  // dashboard, échec=302 vers /login). Si on suit les redirects on perd
  // cette info.
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(
      `LYG admin network: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const location = res.headers.get("location");
  const bodyText = await res.text().catch(() => "");
  return {
    status: res.status,
    location,
    expired: detectExpiry(res.status, location),
    bodyText,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage : 1 ligne par famille dans LygCredential, cookie chiffré.
// ─────────────────────────────────────────────────────────────────────────────

export type LygCredentialState = {
  configured: boolean;
  ownerDiscordId: string | null;
  ownerName: string | null;
  expired: boolean;
  lastVerifiedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  cookieMasked: string | null; // ex "bcd6…02ef6" pour confirmation visuelle, jamais la valeur en clair
  updatedAt: string | null;
};

export async function getLygCredentialState(): Promise<LygCredentialState> {
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const row = await prisma.lygCredential.findUnique({ where: { familyId: familyDbId } });
  if (!row) {
    return {
      configured: false,
      ownerDiscordId: null,
      ownerName: null,
      expired: false,
      lastVerifiedAt: null,
      lastUsedAt: null,
      lastError: null,
      cookieMasked: null,
      updatedAt: null,
    };
  }
  let masked: string | null = null;
  try {
    masked = maskSecret(decryptSecret(row.cookieCiphertext));
  } catch {
    masked = "***corrupted***";
  }
  return {
    configured: true,
    ownerDiscordId: row.ownerDiscordId,
    ownerName: row.ownerName,
    expired: row.expired,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastError: row.lastError,
    cookieMasked: masked,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function setLygCredential(opts: {
  cookie: string;
  ownerDiscordId: string;
  ownerName: string | null;
}): Promise<void> {
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const clean = opts.cookie.trim();
  if (!clean) throw new Error("Cookie vide");
  // Strip éventuel préfixe "PHPSESSID=" si le user a collé l'entête complet.
  const value = clean.replace(/^PHPSESSID=/i, "").replace(/;.*$/, "").trim();
  if (!/^[A-Za-z0-9]+$/.test(value)) {
    throw new Error("Cookie format invalide (attendu : caractères alphanumériques)");
  }
  const ciphertext = encryptSecret(value);
  await prisma.lygCredential.upsert({
    where: { familyId: familyDbId },
    create: {
      familyId: familyDbId,
      cookieCiphertext: ciphertext,
      ownerDiscordId: opts.ownerDiscordId,
      ownerName: opts.ownerName,
      expired: false,
      lastError: null,
    },
    update: {
      cookieCiphertext: ciphertext,
      ownerDiscordId: opts.ownerDiscordId,
      ownerName: opts.ownerName,
      expired: false,
      lastError: null,
    },
  });
}

export async function clearLygCredential(): Promise<void> {
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  await prisma.lygCredential.deleteMany({ where: { familyId: familyDbId } });
}

async function loadCookieOrThrow(): Promise<{
  cookie: string;
  ownerDiscordId: string;
}> {
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const row = await prisma.lygCredential.findUnique({ where: { familyId: familyDbId } });
  if (!row) {
    throw new Error("LYG_COOKIE_NOT_CONFIGURED");
  }
  if (row.expired) {
    throw new Error("LYG_COOKIE_EXPIRED");
  }
  const cookie = decryptSecret(row.cookieCiphertext);
  return { cookie, ownerDiscordId: row.ownerDiscordId };
}

async function markUsed(meta: { ok: boolean; error?: string | null; status: number }) {
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  await prisma.lygCredential.update({
    where: { familyId: familyDbId },
    data: {
      lastUsedAt: new Date(),
      ...(meta.ok ? { lastVerifiedAt: new Date(), expired: false, lastError: null } : {}),
    },
  }).catch(() => {});
}

async function markExpired(reason: string) {
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  // Si ce marquage echoue en silence, le cookie reste affiche comme VALIDE
  // alors qu'il ne fonctionne plus : le chef ne sait pas qu'il doit le
  // renouveler, et chaque appel LYG echoue sans explication. On trace, mais
  // on ne propage pas : l'appelant traite deja l'echec LYG d'origine.
  await prisma.lygCredential
    .update({
      where: { familyId: familyDbId },
      data: { expired: true, lastError: reason, lastUsedAt: new Date() },
    })
    .catch((err: unknown) => {
      console.error("[lyg/family-admin] marquage du cookie expire echoue", {
        familyDbId,
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions publiques. Chacune charge le cookie, appelle l'admin, met à jour
// les métriques. Renvoie un résultat structuré (jamais throw, sauf si pas
// de cookie configuré ou cookie expiré — qui sont des erreurs "système").
// ─────────────────────────────────────────────────────────────────────────────

async function executeAction(
  type: LygFamilyActionType,
  steamId: string,
  currentClass?: number
): Promise<LygFamilyActionResult> {
  const started = Date.now();
  const { cookie } = await loadCookieOrThrow();

  let response: Awaited<ReturnType<typeof callLygAdmin>>;
  try {
    if (type === "up" || type === "down") {
      if (typeof currentClass !== "number") {
        throw new Error(`currentClass requis pour type=${type}`);
      }
      response = await callLygAdmin({
        cookie,
        method: "GET",
        query: { steamid: steamId, type, class: String(currentClass) },
      });
    } else if (type === "del") {
      response = await callLygAdmin({
        cookie,
        method: "GET",
        query: { steamid: steamId, type: "del" },
      });
    } else {
      // type === "add"
      response = await callLygAdmin({
        cookie,
        method: "POST",
        body: { steamid: steamId },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markUsed({ ok: false, status: 0 });
    return { ok: false, status: 0, tookMs: Date.now() - started, error: msg, expired: false };
  }

  const tookMs = Date.now() - started;

  // Observation pure, placée avant tout branchement pour couvrir les trois
  // issues (expiré / retenu OK / retenu en échec) avec un seul point de sortie
  // dans les logs. `retained` reproduit la décision du code SANS la modifier :
  // c'est la valeur à confronter plus tard à l'effet métier réel.
  logInfo("lyg_family_action_observed", {
    action: type,
    steamId,
    status: response.status,
    location: response.location ? redactSecrets(response.location) : null,
    bodyExcerpt: summarizeBody(response.bodyText),
    bodyLength: response.bodyText.length,
    expiredDetected: response.expired,
    retained: response.expired
      ? "failed_expired"
      : response.status === 302 || response.status === 200
        ? "ok"
        : "failed_status",
    tookMs,
  });

  if (response.expired) {
    await markExpired("Cookie PHPSESSID expiré (redirect vers /login)");
    return {
      ok: false,
      status: response.status,
      tookMs,
      error: "Cookie expiré — redonne un nouveau cookie dans Paramètres → LYG",
      expired: true,
    };
  }

  // 302 sans redirect vers login = succès (le site PHP redirige vers le dashboard
  // après une action réussie). 200 = aussi acceptable.
  const success = response.status === 302 || response.status === 200;
  if (success) {
    await markUsed({ ok: true, status: response.status });
    return { ok: true, status: response.status, tookMs };
  }

  // Autres status (400, 500, etc.) — erreur métier
  await markUsed({ ok: false, status: response.status });
  return {
    ok: false,
    status: response.status,
    tookMs,
    error: `LYG admin a renvoyé status ${response.status}`,
    expired: false,
  };
}

export async function lygFamilyRankUp(steamId: string, currentClass: number) {
  return executeAction("up", steamId, currentClass);
}

export async function lygFamilyRankDown(steamId: string, currentClass: number) {
  return executeAction("down", steamId, currentClass);
}

export async function lygFamilyRemove(steamId: string) {
  return executeAction("del", steamId);
}

export async function lygFamilyAdd(steamId: string) {
  return executeAction("add", steamId);
}

// ─────────────────────────────────────────────────────────────────────────────
// GESTION DES ARMES PAR CLASSE WL
// ─────────────────────────────────────────────────────────────────────────────
//
// Le site families.lyg.fr expose une page /pages/weapons.php qui permet
// d'attribuer des armes par "classe métier" (= classe WL 1..4). Chaque arme
// a un coût en points. Chaque classe a un budget de points à ne pas dépasser.
//
// Protocole découvert (parsing HTML + form) :
//   Catalogue : <select name="weapons"> avec <option value="ID">[coût] Nom</option>
//   Classes   : 4 blocs "Armes Métier n°N" listant les armes attribuées + Total
//   Ajouter   : POST /modules/edit.php   body: weapons=ID & class=N
//   Retirer   : GET  /modules/edit.php?rem_weapons=ID&class_weapons=N
//
// Budgets de points par classe (fournis par le Chef famille, non exposés par
// la page elle-même) :
export const WEAPON_CLASS_BUDGETS: Record<number, number> = {
  1: 150,
  2: 110,
  3: 110,
  4: 100,
};

export const WEAPON_CLASSES = [1, 2, 3, 4] as const;

export type WeaponCatalogItem = { id: string; name: string; cost: number };

export type FamilyWeaponsState = {
  /** Catalogue complet des armes disponibles (id interne, nom, coût). */
  catalog: WeaponCatalogItem[];
  /** Armes attribuées par classe (1..4). */
  classes: Record<number, WeaponCatalogItem[]>;
  /** Total de points consommé par classe (tel que renvoyé par LYG). */
  totals: Record<number, number>;
  /** Budget max par classe. */
  budgets: Record<number, number>;
};

export type FamilyWeaponsStateResult =
  | { ok: true; state: FamilyWeaponsState; tookMs: number }
  | { ok: false; error: string; expired: boolean; tookMs: number };

/** Parse la page weapons.php → catalogue + attributions par classe. */
function parseWeaponsHtml(html: string): {
  catalog: WeaponCatalogItem[];
  classIds: Record<number, string[]>;
  totals: Record<number, number>;
} {
  // 1) Catalogue depuis <select name="weapons">
  const catalog: WeaponCatalogItem[] = [];
  const selectMatch = html.match(
    /<select\b[^>]*name\s*=\s*["']weapons["'][^>]*>([\s\S]*?)<\/select>/i
  );
  if (selectMatch) {
    for (const o of selectMatch[1].matchAll(
      /<option\b[^>]*value\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi
    )) {
      const id = o[1].trim();
      const text = o[2].replace(/\s+/g, " ").trim();
      const m = text.match(/^\[(\d+)\]\s*(.+)$/);
      if (id && m) {
        catalog.push({ id, cost: Number(m[1]), name: m[2].trim() });
      }
    }
  }

  // 2) Attributions par classe + totaux depuis les blocs "Armes Métier n°N"
  const classIds: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [] };
  const totals: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const block of html.matchAll(
    /Armes Métier n°(\d)<\/p>([\s\S]*?)Total\s*:\s*(\d+)/gi
  )) {
    const cls = Number(block[1]);
    if (!(cls in classIds)) continue;
    const inner = block[2];
    for (const a of inner.matchAll(
      /rem_weapons=([^&"']+)&(?:amp;)?class_weapons=(\d)/gi
    )) {
      const wid = decodeURIComponent(a[1].trim());
      const aCls = Number(a[2]);
      if (aCls === cls) classIds[cls].push(wid);
    }
    totals[cls] = Number(block[3]);
  }

  return { catalog, classIds, totals };
}

/** Récupère l'état complet des armes (lecture seule, GET weapons.php). */
export async function fetchFamilyWeaponsState(): Promise<FamilyWeaponsStateResult> {
  const started = Date.now();
  const { cookie } = await loadCookieOrThrow();

  let res: Response;
  try {
    res = await fetch(`${FAMILY_ADMIN_BASE}/pages/weapons.php`, {
      headers: { ...COMMON_HEADERS, Cookie: `PHPSESSID=${cookie}` },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg, expired: false, tookMs: Date.now() - started };
  }

  const tookMs = Date.now() - started;

  if (detectExpiry(res.status, res.headers.get("location"))) {
    await markExpired("Cookie expiré (fetch armes)");
    return {
      ok: false,
      error: "Cookie expiré — redonne un nouveau cookie dans Paramètres → LYG",
      expired: true,
      tookMs,
    };
  }
  if (res.status !== 200) {
    await markUsed({ ok: false, status: res.status });
    return { ok: false, error: `LYG a renvoyé status ${res.status}`, expired: false, tookMs };
  }

  const html = await res.text();
  const { catalog, classIds, totals } = parseWeaponsHtml(html);

  if (catalog.length === 0) {
    await markUsed({ ok: false, status: res.status });
    return {
      ok: false,
      error: "Impossible de parser le catalogue d'armes (structure LYG modifiée ?)",
      expired: false,
      tookMs,
    };
  }

  const byId = new Map(catalog.map((w) => [w.id, w]));
  const classes: Record<number, WeaponCatalogItem[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const cls of WEAPON_CLASSES) {
    classes[cls] = classIds[cls].map(
      (id) => byId.get(id) ?? { id, name: id, cost: 0 }
    );
  }

  await markUsed({ ok: true, status: res.status });
  return {
    ok: true,
    tookMs,
    state: {
      catalog,
      classes,
      totals,
      budgets: WEAPON_CLASS_BUDGETS,
    },
  };
}

/** Ajoute une arme à une classe (POST edit.php weapons=ID&class=N). */
export async function lygWeaponAdd(
  weaponId: string,
  classNum: number
): Promise<LygFamilyActionResult> {
  const started = Date.now();
  const { cookie } = await loadCookieOrThrow();
  let response: Awaited<ReturnType<typeof callLygAdmin>>;
  try {
    response = await callLygAdmin({
      cookie,
      method: "POST",
      body: { weapons: weaponId, class: String(classNum) },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markUsed({ ok: false, status: 0 });
    return { ok: false, status: 0, tookMs: Date.now() - started, error: msg, expired: false };
  }
  return finishWeaponAction(response, started);
}

/** Retire une arme d'une classe (GET edit.php?rem_weapons=ID&class_weapons=N). */
export async function lygWeaponRemove(
  weaponId: string,
  classNum: number
): Promise<LygFamilyActionResult> {
  const started = Date.now();
  const { cookie } = await loadCookieOrThrow();
  let response: Awaited<ReturnType<typeof callLygAdmin>>;
  try {
    response = await callLygAdmin({
      cookie,
      method: "GET",
      query: { rem_weapons: weaponId, class_weapons: String(classNum) },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markUsed({ ok: false, status: 0 });
    return { ok: false, status: 0, tookMs: Date.now() - started, error: msg, expired: false };
  }
  return finishWeaponAction(response, started);
}

/** Logique commune de fin d'action arme (réplique de executeAction). */
async function finishWeaponAction(
  response: Awaited<ReturnType<typeof callLygAdmin>>,
  started: number
): Promise<LygFamilyActionResult> {
  const tookMs = Date.now() - started;
  if (response.expired) {
    await markExpired("Cookie PHPSESSID expiré (redirect vers /login)");
    return {
      ok: false,
      status: response.status,
      tookMs,
      error: "Cookie expiré — redonne un nouveau cookie dans Paramètres → LYG",
      expired: true,
    };
  }
  const success = response.status === 302 || response.status === 200;
  if (success) {
    await markUsed({ ok: true, status: response.status });
    return { ok: true, status: response.status, tookMs };
  }
  await markUsed({ ok: false, status: response.status });
  return {
    ok: false,
    status: response.status,
    tookMs,
    error: `LYG admin a renvoyé status ${response.status}`,
    expired: false,
  };
}

/**
 * Test "ping" : vérifie juste que le cookie est valide en touchant le
 * dashboard (GET /pages/dashboard.php). Si on ne se fait pas rediriger
 * vers /login, c'est OK.
 */
export async function testLygCookie(): Promise<LygFamilyActionResult> {
  const started = Date.now();
  const { cookie } = await loadCookieOrThrow();

  let res: Response;
  try {
    res = await fetch(`${FAMILY_ADMIN_BASE}/pages/dashboard.php`, {
      headers: {
        ...COMMON_HEADERS,
        Cookie: `PHPSESSID=${cookie}`,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, tookMs: Date.now() - started, error: msg, expired: false };
  }

  const tookMs = Date.now() - started;
  const expired = detectExpiry(res.status, res.headers.get("location"));
  if (expired) {
    await markExpired("Cookie expiré (test ping)");
    return {
      ok: false,
      status: res.status,
      tookMs,
      error: "Cookie expiré — redonne un nouveau cookie",
      expired: true,
    };
  }
  if (res.status === 200) {
    await markUsed({ ok: true, status: 200 });
    return { ok: true, status: 200, tookMs };
  }
  return {
    ok: false,
    status: res.status,
    tookMs,
    error: `Status inattendu ${res.status}`,
    expired: false,
  };
}
