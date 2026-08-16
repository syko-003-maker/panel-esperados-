import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendDiscordAlert } from "@/lib/alerts";
import { toFamilyCuid } from "@/lib/family";
import { openAlertIfNew, resolveAlertIfOpen, formatDuration } from "@/lib/alert-state";

/**
 * GET /api/cron/worker-watchdog
 *
 * Appelé par le timer systemd `panel-worker-watchdog.timer` toutes les 2 minutes.
 * Vérifie :
 *   1. Heartbeat du discord-worker (alerte si stale > 3 min)
 *   2. Mémoire panel + worker (alerte si > MEMORY_WATCH_MB, défaut 600 MB)
 *
 * Auth : CRON_SECRET (Bearer ou ?secret=).
 *
 * Retourne :
 *   200 + workerAlive=true si tout OK
 *   200 + workerAlive=false si stale (l'alerte a été envoyée)
 *   401 si secret manquant
 */

const FAMILY_SLUG = "esperados";
const HEARTBEAT_MAX_AGE_MS = 180_000;
const MEMORY_WATCH_MB = Number(process.env.MEMORY_WATCH_MB ?? 600);

// ── Présentation des alertes de supervision ─────────────────────────────────
//
// Palette reprise de `ticketLogEmbed.ts` : la couleur porte le sens, jamais la
// déco. Le retour à la normale était bleu (`severity: "info"`) alors que son
// propre emoji annonçait du vert — on fixe la couleur explicitement.
const TONE_DOWN = 0xed4245;
const TONE_UP = 0x3ba55d;
const SUPERVISION_FOOTER = "Los Esperados • Supervision";

// Le staff lit « bot Discord », pas « worker » : le vocabulaire d'architecture
// interne n'a pas à fuiter dans un salon. `discord-worker` reste réservé aux
// logs et à l'AlertEvent, qui eux s'adressent à l'exploitant.
const IMPACT_DOWN = "les messages automatisés peuvent rester en attente";

/** Horodatage relatif Discord : « il y a 4 minutes », dans le fuseau du lecteur. */
function discordRelative(date: Date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

/**
 * Prépare un message d'exception pour l'affichage dans un salon.
 *
 * Deux précautions, dans cet ordre :
 *
 * 1. Masquer les identifiants. Une erreur d'initialisation Prisma peut recracher
 *    la chaîne de connexion, mot de passe compris — c'est précisément la classe
 *    de fuite qu'on cherche à éviter ailleurs dans le projet. On ne fait pas
 *    confiance au contenu d'un message d'erreur.
 * 2. Neutraliser les accents graves. Prisma en met autour des identifiants
 *    (« Can't reach database server at `127.0.0.1` ») ; à l'intérieur d'un code
 *    inline Discord, ils referment le bloc en plein milieu et le reste de la
 *    ligne part en texte brut.
 * 3. Tronquer. Une stack Prisma dépasse largement ce qu'une ligne de description
 *    peut porter.
 */
function safeErrorDetail(raw: string | null, max = 200) {
  if (!raw) return null;
  const masked = raw
    // scheme://user:motdepasse@hote  →  scheme://user:***@hote
    .replace(/(\w+:\/\/[^:/\s]+):[^@\s]*@/g, "$1:***@")
    .replace(/`/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!masked) return null;
  return masked.length <= max ? masked : `${masked.slice(0, max - 1)}…`;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const provided =
    authHeader?.replace("Bearer ", "");
  // Plus de secret accepté en query string (fuite dans les logs d'accès) —
  // header Authorization: Bearer uniquement (c'est ce qu'utilise le timer systemd).

  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let lastSeenAt: Date | null = null;
  let workerName: string | null = null;
  let workerMemMB: number | null = null;
  let dbReachable = true;
  let dbError: string | null = null;

  try {
    const hb = await (prisma as any).workerHeartbeat?.findUnique({
      where: { familyId: await toFamilyCuid(FAMILY_SLUG) },
      select: { lastSeenAt: true, workerName: true, meta: true },
    });
    if (hb?.lastSeenAt) {
      lastSeenAt = new Date(hb.lastSeenAt);
      workerName = hb.workerName ?? null;
      const memMaybe = (hb.meta as any)?.memMB;
      workerMemMB = typeof memMaybe === "number" ? memMaybe : null;
    }
  } catch (err) {
    dbReachable = false;
    dbError = err instanceof Error ? err.message : String(err);
  }

  if (!dbReachable) {
    const detail = safeErrorDetail(dbError);
    await sendDiscordAlert({
      key: "watchdog_db_unreachable",
      severity: "critical",
      title: "🔴 Base de données indisponible",
      color: TONE_DOWN,
      footer: SUPERVISION_FOOTER,
      lines: [
        { label: "Signal", value: "le panel ne parvient pas à joindre la base" },
        { label: "Impact", value: "le site et les traitements automatisés sont interrompus" },
        // Seule ligne technique, et la seule en code inline : c'est un message
        // machine, pas de la prose. Absente si l'erreur est vide — `renderLines`
        // n'affiche jamais un libellé sans valeur.
        detail ? { label: "Détail", value: `\`${detail}\`` } : null,
      ],
    });
    return NextResponse.json({
      ok: false,
      workerAlive: false,
      reason: "db_unreachable",
      error: dbError,
    }, { status: 200 });
  }

  if (!lastSeenAt) {
    // Meme logique persistante : la ligne WorkerHeartbeat est supprimee par le
    // worker a l'arret propre (liberation du verrou), donc son absence est le
    // signal normal d'un worker eteint.
    const isNew = await openAlertIfNew({
      type: "worker.offline",
      severity: "critical",
      message: "Aucune ligne WorkerHeartbeat : worker eteint ou jamais demarre",
      meta: { familySlug: FAMILY_SLUG },
    });
    if (isNew) {
      await sendDiscordAlert({
        key: "watchdog_no_heartbeat",
        severity: "error",
        title: "🔴 Bot Discord hors ligne",
        color: TONE_DOWN,
        footer: SUPERVISION_FOOTER,
        lines: [
          { label: "Signal", value: "aucun heartbeat détecté" },
          { label: "Impact", value: IMPACT_DOWN },
        ],
      });
    }
    return NextResponse.json({
      ok: false,
      workerAlive: false,
      reason: "no_heartbeat",
    });
  }

  const ageMs = Date.now() - lastSeenAt.getTime();
  const workerAlive = ageMs < HEARTBEAT_MAX_AGE_MS;

  // Etat persistant : une seule alerte par panne, + une alerte au retour.
  // Sans ca, le timer (5 min) notifierait a chaque passage tant que la panne dure.
  if (!workerAlive) {
    const isNew = await openAlertIfNew({
      type: "worker.offline",
      severity: "critical",
      message: `Worker Discord sans battement depuis ${Math.round(ageMs / 1000)} s`,
      meta: { workerName, lastSeenAt: lastSeenAt.toISOString(), ageMs },
    });
    if (isNew) {
      await sendDiscordAlert({
        key: "watchdog_worker_stale",
        severity: "error",
        title: "🔴 Bot Discord ne répond plus",
        color: TONE_DOWN,
        footer: SUPERVISION_FOOTER,
        lines: [
          { label: "Dernier battement", value: discordRelative(lastSeenAt) },
          { label: "Seuil", value: `${HEARTBEAT_MAX_AGE_MS / 1000} s` },
          { label: "Impact", value: IMPACT_DOWN },
        ],
      });
    }
  } else {
    const downSeconds = await resolveAlertIfOpen("worker.offline");
    if (downSeconds !== null) {
      await sendDiscordAlert({
        key: "watchdog_worker_recovered",
        severity: "info",
        title: "✅ Bot Discord de nouveau opérationnel",
        color: TONE_UP,
        footer: SUPERVISION_FOOTER,
        lines: [
          { label: "Indisponibilité", value: formatDuration(downSeconds) },
          { label: "Battement", value: discordRelative(lastSeenAt) },
          { label: "État", value: "les traitements ont repris normalement" },
        ],
      });
    }
  }

  // ── Surveillance mémoire ────────────────────────────────────────────
  // Mesure :
  //   - panel  : process.memoryUsage().rss du process Next.js courant
  //   - worker : meta.memMB lu depuis WorkerHeartbeat (écrit toutes les 60s)
  // Throttle : sendDiscordAlert dédupe 1 alerte/min/clé, donc safe à appeler
  // toutes les 2 min même si le seuil est dépassé.
  const panelMemMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const memoryWarnings: Array<{ component: string; memMB: number }> = [];
  if (panelMemMB > MEMORY_WATCH_MB) memoryWarnings.push({ component: "panel", memMB: panelMemMB });
  if (workerMemMB != null && workerMemMB > MEMORY_WATCH_MB) {
    memoryWarnings.push({ component: "worker", memMB: workerMemMB });
  }

  for (const w of memoryWarnings) {
    // Log structuré (visible dans journalctl panel)
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "warn",
      event: "memory_threshold_exceeded",
      component: w.component,
      memMB: w.memMB,
      thresholdMB: MEMORY_WATCH_MB,
    }));

    // Alerte Discord (si webhook configuré, sinon log JSON only via fallback)
    await sendDiscordAlert({
      key: `memory_high_${w.component}`,
      severity: "warn",
      title: `Mémoire ${w.component} > ${MEMORY_WATCH_MB} MB`,
      fields: {
        component: w.component,
        currentMB: w.memMB,
        thresholdMB: MEMORY_WATCH_MB,
        action: "Investiguer fuite éventuelle, redémarrer si > 1 GB",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    workerAlive,
    lastSeenAt: lastSeenAt.toISOString(),
    ageMs,
    workerName,
    memory: {
      panelMB: panelMemMB,
      workerMB: workerMemMB,
      thresholdMB: MEMORY_WATCH_MB,
      warnings: memoryWarnings.map((w) => w.component),
    },
  });
}
