import { config } from "dotenv";
import { resolve, join } from "path";
import { existsSync, writeFileSync, readFileSync } from "fs";

// ✅ CRITICAL: After dotenv loaded, configure with explicit prod path if needed
// Ensures critical channel IDs are always defined, with automatic .env.prod creation

// Fixed channel IDs for production (non-negotiable)
const FIXED_CHANNELS = {
  BOTS_FAMILLE_CHANNEL_ID: "1452869229295698025",
  CONTACT_CHANNEL_ID: "1452869229295698025",
  TICKETS_PARENT_CHANNEL_ID: "1337799725662863380",
  TICKETS_LOGS_CHANNEL_ID: "1325618925303758858",
};

const DEFAULT_INGEST_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_PANEL_BASE_URL = "https://losesperados.fr";

function ensureEnvFile(envPath: string, isRoot: boolean = false): void {
  if (!existsSync(envPath)) {
    // Auto-create .env.prod with required variables
    const panelBaseUrl = (process.env.NEXTAUTH_URL || process.env.PANEL_BASE_URL || DEFAULT_PANEL_BASE_URL).replace(/\/+$/, "");
    const ingestBaseUrl = (process.env.INGEST_BASE_URL || DEFAULT_INGEST_BASE_URL).replace(/\/+$/, "");
    let content = `# Auto-generated Discord Worker Environment (${new Date().toISOString().split('T')[0]})
# PRODUCTION CONFIGURATION

`;
    
    if (isRoot) {
      // Root .env.prod includes panel + worker config
      content += `# Panel Configuration
NEXTAUTH_URL=${panelBaseUrl}
NEXTAUTH_SECRET=${process.env.NEXTAUTH_SECRET || "CHANGE_ME_NEXTAUTH_SECRET"}
INGEST_BASE_URL=${ingestBaseUrl}
INGEST_SECRET=${process.env.INGEST_SECRET || "CHANGE_ME_INGEST_SECRET"}

# Discord Bot (Panel)
DISCORD_BOT_TOKEN=${process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || "YOUR_BOT_TOKEN"}
DISCORD_GUILD_ID=1312845998753710151

`;
    }
    
    // Worker configuration (same in both files)
    content += `# Discord Worker Configuration
DISCORD_TOKEN=${process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || "YOUR_BOT_TOKEN"}
GUILD_ID=1312845998753710151
BOTS_FAMILLE_CHANNEL_ID=${FIXED_CHANNELS.BOTS_FAMILLE_CHANNEL_ID}
CONTACT_CHANNEL_ID=${FIXED_CHANNELS.CONTACT_CHANNEL_ID}
TICKETS_PARENT_CHANNEL_ID=${FIXED_CHANNELS.TICKETS_PARENT_CHANNEL_ID}
TICKETS_LOGS_CHANNEL_ID=${FIXED_CHANNELS.TICKETS_LOGS_CHANNEL_ID}
INGEST_BASE_URL=${ingestBaseUrl}
INGEST_SECRET=${process.env.INGEST_SECRET || "CHANGE_ME_INGEST_SECRET"}

NODE_ENV=production
`;
    
    writeFileSync(envPath, content, "utf8");
    console.log("[ENV AUTO-CREATE]", "Created:", envPath);
  }
}

function loadEnv() {
  if (process.env.NODE_ENV === "production") {
    // Production: Try to load .env.prod from multiple locations
    // Create missing files automatically with fixed channel IDs
    
    const localPath = resolve(".env.prod");           // discord-worker/.env.prod
    const rootPath = resolve("../.env.prod");         // ../.env.prod
    const cwdLocalPath = join(process.cwd(), ".env.prod");
    const cwdRootPath = join(process.cwd(), "../.env.prod");
    
    // Ensure files exist (auto-create with fixed values)
    ensureEnvFile(localPath, false);
    ensureEnvFile(rootPath, true);
    
    // Load in priority order - try all paths to ensure values are available
    const paths = [localPath, rootPath, cwdLocalPath, cwdRootPath];
    const validPaths = paths.filter(p => existsSync(p));
    
    if (validPaths.length === 0) {
      console.warn("[ENV LOADER] Warning: No .env.prod found, created auto-generated files");
    } else {
      // Load from the first valid path (priority order)
      console.log("[ENV LOADER] Production mode - Loading from:", validPaths[0]);
      config({ path: validPaths[0], override: false }); // Don't override existing vars
    }
  } else {
    // Development: load default .env files
    console.log("[ENV LOADER] Development mode - loading default .env");
    config();
  }
  
  // Ensure critical fixed values are set (these are fallback defaults)
  if (!process.env.BOTS_FAMILLE_CHANNEL_ID) {
    process.env.BOTS_FAMILLE_CHANNEL_ID = FIXED_CHANNELS.BOTS_FAMILLE_CHANNEL_ID;
  }
  if (!process.env.CONTACT_CHANNEL_ID) {
    process.env.CONTACT_CHANNEL_ID = FIXED_CHANNELS.CONTACT_CHANNEL_ID;
  }
  if (!process.env.TICKETS_PARENT_CHANNEL_ID) {
    process.env.TICKETS_PARENT_CHANNEL_ID = FIXED_CHANNELS.TICKETS_PARENT_CHANNEL_ID;
  }
  if (!process.env.TICKETS_LOGS_CHANNEL_ID) {
    process.env.TICKETS_LOGS_CHANNEL_ID = FIXED_CHANNELS.TICKETS_LOGS_CHANNEL_ID;
  }
}

// Load env before other imports
loadEnv();

import { Client, GatewayIntentBits, Partials, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags, type Interaction } from "discord.js";
import { setupServerLogs, cacheMessage, preCacheGuildMessages } from "./features/logs/serverLogs.js";
import { handleAntispam } from "./features/antispam/antispam.js";
import { handleReglementAccept, handleReglementPost, REGLEMENT_ACCEPT_BUTTON } from "./features/reglement/reglementRole.js";
import { ensureContactPanel } from "./contactPanel.js";
import { CUSTOM_ID, IDS } from "./ids.js";
import {
  openRecruitmentModal,
  openComplaintModal,
  handleRecruitmentSubmit,
  handleComplaintSubmit,
  handleStaffButtons,
} from "./tickets.js";
import { runRoleSync } from "./syncRoles.js";
import { registerCommands, handleCommand } from "./commands.js";
import {
  handleLinkButtonInteraction,
  handleLinkModalSubmission,
  handleUnlinkButtonInteraction,
  LINK_CUSTOM_IDS,
} from "./link.js";
import { initWorkerServer } from "./http-server.js";
import {
  handleLinkRequestAction,
  sendLinkRequestDecisionMessage,
  getActionConfirmation,
  sendLinkAcceptedDM,
} from "./link-request-handler.js";
import { handleRecruitmentDecision } from "./recruitment-decision.js";
import { handleComplaintDecision } from "./complaint-decision.js";
import { processOutboxQueue } from "./outbox-processor.js";
import { pollLygWarns } from "./features/lygWarnPoller.js";
import {
  runBanklogsAutoSyncJob,
  getBanklogsSyncIntervalMs,
  getLastBanklogsAutoSyncAt,
} from "./banklogs-auto-sync.js";
import {
  runInfosAutoSyncJob,
  getInfosSyncIntervalMs,
  getLastInfosAutoSyncAt,
} from "./infos-auto-sync.js";
import {
  runMembersAutoSyncJob,
  getMembersSyncIntervalMs,
  getLastMembersAutoSyncAt,
} from "./members-auto-sync.js";
import {
  runPlaytimeAutoSyncJob,
  getPlaytimeSyncIntervalMs,
  getLastPlaytimeAutoSyncAt,
} from "./playtime-auto-sync.js";
import {
  runAbsencesExpireJob,
  getAbsencesExpireIntervalMs,
  getLastAbsencesExpireAt,
} from "./absences-expire.js";
import { syncHierarchyMessage } from "./features/hierarchy/hierarchyMessage.js";
import { PrismaClient } from "@prisma/client";
import { initSentry, captureException } from "./sentry.js";
import { startHeartbeat } from "./heartbeat.js";
import { sendDiscordAlert } from "./alerts.js";

// Init Sentry au plus tôt (no-op si SENTRY_DSN absent — n'affecte pas le boot)
void initSentry();

// Tracking sync stalled : compteur consécutif par sync.
// Quand on atteint le seuil → alerte Discord (throttle interne du module alerts).
// Quand le sync redevient sain (cycle sans stall), le compteur retombe à 0.
const stallCounters: Record<string, number> = {};
const STALL_ALERT_THRESHOLD = 5;
function trackStall(name: string, isStalled: boolean, ctx: Record<string, unknown> = {}) {
  if (!isStalled) {
    if (stallCounters[name]) stallCounters[name] = 0;
    return;
  }
  const next = (stallCounters[name] ?? 0) + 1;
  stallCounters[name] = next;
  if (next === STALL_ALERT_THRESHOLD) {
    void sendDiscordAlert({
      key: `sync_stalled_${name}`,
      severity: "error",
      title: `Sync ${name} stalled (${STALL_ALERT_THRESHOLD} cycles consécutifs)`,
      fields: { ...ctx, threshold: STALL_ALERT_THRESHOLD },
    });
  }
}

const LEGACY_TICKETS_PANEL_RECRUIT_ID = "ticket:recruitment";
const LEGACY_TICKETS_PANEL_COMPLAINT_ID = "ticket:complaint";

// Initialize Prisma for outbox processing
const prisma = new PrismaClient();

// Sync interval (5 minutes)
const SYNC_INTERVAL_MS = 3 * 60 * 1000;
// Outbox polling interval (3 seconds)
const OUTBOX_POLL_INTERVAL_MS = 3 * 1000;

// ─────────────────────────────────────────────────────────────
// ENV validation
// ─────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  "DISCORD_TOKEN",
  "GUILD_ID",
  "BOTS_FAMILLE_CHANNEL_ID",
  "CONTACT_CHANNEL_ID",
  "TICKETS_PARENT_CHANNEL_ID",
  "TICKETS_LOGS_CHANNEL_ID",
  "INGEST_BASE_URL",
  "INGEST_SECRET",
];

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function validateEnv() {
  const missing: string[] = [];
  for (const name of REQUIRED_ENV) {
    if (!process.env[name]) missing.push(name);
  }
  
  // ✅ Log env check - show critical channels status
  const botsFamilleOK = !!process.env.BOTS_FAMILLE_CHANNEL_ID;
  const contactOK = !!process.env.CONTACT_CHANNEL_ID;
  const ticketsParentOK = !!process.env.TICKETS_PARENT_CHANNEL_ID;
  const ticketsLogsOK = !!process.env.TICKETS_LOGS_CHANNEL_ID;
  const allCriticalOK = botsFamilleOK && contactOK && ticketsParentOK && ticketsLogsOK;
  
  console.log(
    allCriticalOK ? "[ENV CHECK OK]" : "[ENV CHECK FAIL]",
    {
      BOTS_FAMILLE_CHANNEL_ID: process.env.BOTS_FAMILLE_CHANNEL_ID || "❌ MISSING",
      CONTACT_CHANNEL_ID: process.env.CONTACT_CHANNEL_ID || "❌ MISSING",
      TICKETS_PARENT_CHANNEL_ID: process.env.TICKETS_PARENT_CHANNEL_ID || "❌ MISSING",
      TICKETS_LOGS_CHANNEL_ID: process.env.TICKETS_LOGS_CHANNEL_ID || "❌ MISSING",
      DISCORD_TOKEN: process.env.DISCORD_TOKEN ? "✅ LOADED" : "❌ MISSING",
      GUILD_ID: process.env.GUILD_ID || "❌ MISSING",
      INGEST_BASE_URL: process.env.INGEST_BASE_URL || "❌ MISSING",
      INGEST_SECRET: process.env.INGEST_SECRET ? "✅ LOADED" : "❌ MISSING",
    }
  );
  
  if (missing.length > 0) {
    console.error(JSON.stringify({
      event: "boot_error",
      error: "Missing required environment variables",
      missing,
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────
// Logging helpers
// ─────────────────────────────────────────────────────────────

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    event,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

function logError(event: string, error: unknown, data: Record<string, unknown> = {}) {
  console.error(JSON.stringify({
    event,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

function isLegacyIngestUrl(url: string | undefined): boolean {
  return !!url && url.includes("losesperados.xyz");
}

function getPanelHealthBaseUrl(): string | undefined {
  return process.env.PANEL_BASE_URL || process.env.INGEST_BASE_URL;
}

// ─────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────

async function checkPanelHealth(): Promise<boolean> {
  const baseUrl = getPanelHealthBaseUrl();
  if (!baseUrl) return false;

  try {
    const res = await fetch(`${baseUrl}/api/health`, { 
      signal: AbortSignal.timeout(5000) 
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────

validateEnv();

const client = new Client({
  // IMPORTANT: GuildMessages requis pour fetch messages (upsert panel)
  // GuildMembers requis pour sync rôles
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,      // Required for role sync + logs membres
    GatewayIntentBits.MessageContent,    // Required pour lire contenu messages supprimés/modifiés
    GatewayIntentBits.GuildModeration,   // Required pour logs ban/unban
    GatewayIntentBits.GuildVoiceStates,  // Required pour logs vocal
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember], // Pour les messages non mis en cache
});

client.once("ready", async () => {
  // ✅ Log environment configuration at boot
  const ingestBaseUrl = process.env.INGEST_BASE_URL || "(NOT SET)";
  const ingestSecretLength = process.env.INGEST_SECRET ? process.env.INGEST_SECRET.length : 0;
  const discordTokenLength = process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.length : 0;
  
  console.log("[ENV CONFIG AT BOOT]", {
    INGEST_BASE_URL: ingestBaseUrl,
    INGEST_SECRET_LENGTH: ingestSecretLength,
    DISCORD_TOKEN_LENGTH: discordTokenLength,
  });
  
  log("env_config_at_boot", {
    ingestBaseUrl,
    ingestSecretLength,
    discordTokenLength,
    nodeEnv: process.env.NODE_ENV,
  });

  // ✅ Log worker bot identity for verification
  console.log("[WORKER BOT]", client.user?.tag, client.user?.id);

  log("worker_ready", { bot: client.user?.tag });

  // ✅ CRITICAL: Verify guild access and log guild/bot IDs for "Hors serveur" debugging
  const guildId = process.env.GUILD_ID || IDS.GUILD_ID;
  try {
    const guild = await client.guilds.fetch(guildId);
    const botMember = await guild.members.fetchMe();
    console.log("[GUILD CONFIG]", {
      guildId: guild.id,
      guildName: guild.name,
      botId: client.user?.id,
      botTag: client.user?.tag,
      botInGuild: Boolean(botMember),
      botRoles: botMember?.roles.cache.map(r => r.name).join(", ") || "none",
    });
    log("guild_verified", {
      guildId: guild.id,
      guildName: guild.name,
      botId: client.user?.id,
      rolesCount: botMember?.roles.cache.size || 0,
    });
  } catch (err) {
    console.error("[GUILD CONFIG ERROR]", {
      guildId,
      botId: client.user?.id,
      error: err instanceof Error ? err.message : String(err),
    });
    log("guild_fetch_failed", {
      guildId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Check panel health
  const panelHealthUrl = getPanelHealthBaseUrl();
  const panelOk = await checkPanelHealth();
  if (panelOk) {
    log("panel_health_ok", { url: panelHealthUrl });
  } else {
    log("panel_health_warn", { 
      url: panelHealthUrl,
      message: "Panel health check failed - continuing anyway"
    });
  }

  // Upsert contact panel
  try {
    await ensureContactPanel(client);
    log("contact_panel_ok");
  } catch (e: unknown) {
    logError("contact_panel_failed", e);
  }

  // Verify channel access and permissions (HARD FAIL on critical channels)
  const channels = [
    { name: "CONTACT", id: IDS.CONTACT_CHANNEL_ID, critical: true },
    { name: "TICKETS_PARENT", id: IDS.TICKETS_PARENT_CHANNEL_ID, critical: true },
    { name: "TICKETS_LOGS", id: IDS.TICKETS_LOGS_CHANNEL_ID, critical: false }, // logs channel is nice to have
  ];

  let criticalFailure = false;

  for (const ch of channels) {
    try {
      const channel = await client.channels.fetch(ch.id);
      if (!channel) {
        logError("channel_access_failed", new Error("Channel not found"), { channel: ch.name, id: ch.id });
        if (ch.critical) criticalFailure = true;
        continue;
      }
      
      log("channel_access_ok", { channel: ch.name, id: ch.id });
      
      // Check permissions for TICKETS_PARENT (needs ManageThreads)
      if (ch.name === "TICKETS_PARENT" && channel.type === ChannelType.GuildText) {
        const me = channel.guild?.members.me;
        if (me) {
          const perms = channel.permissionsFor(me);
          const hasManageThreads = perms?.has(PermissionFlagsBits.ManageThreads);
          const hasCreateThreads = perms?.has(PermissionFlagsBits.CreatePrivateThreads);
          const hasSendMessages = perms?.has(PermissionFlagsBits.SendMessagesInThreads);
          
          if (!hasManageThreads) {
            log("permission_warn", { 
              channel: ch.name, 
              missing: "ManageThreads",
              message: "Le bot ne pourra pas lock/archive les threads"
            });
          }
          if (!hasCreateThreads) {
            log("permission_warn", { 
              channel: ch.name, 
              missing: "CreatePrivateThreads",
              message: "Le bot créera des threads publics uniquement"
            });
          }
          if (!hasSendMessages) {
            log("permission_warn", { 
              channel: ch.name, 
              missing: "SendMessagesInThreads",
              message: "Le bot ne pourra pas envoyer de messages dans les threads"
            });
            // Missing SendMessagesInThreads is critical
            criticalFailure = true;
          }
          
          if (hasManageThreads && hasCreateThreads && hasSendMessages) {
            log("permissions_ok", { channel: ch.name });
          }
        }
      }
    } catch (e) {
      logError("channel_access_failed", e, { channel: ch.name, id: ch.id });
      if (ch.critical) criticalFailure = true;
    }
  }

  // Hard fail if critical channels are not accessible
  if (criticalFailure) {
    logError("boot_critical_failure", new Error("Critical channels not accessible - shutting down"));
    process.exit(1);
  }

  // Register slash commands
  try {
    await registerCommands(client);
  } catch (e) {
    logError("commands_register_failed", e);
  }

  log("boot_complete", { 
    panelOk, 
    guildId: IDS.GUILD_ID,
    roleConfig: {
      chefFamilleConfigured: Boolean(IDS.CHEF_FAMILLE_ROLE_ID),
      etatMajorConfigured: Boolean(IDS.ETAT_MAJOR_ROLE_ID),
      recruteurConfigured: Boolean(IDS.RECRUTEUR_ROLE_ID),
    },
  });

  // Initialize HTTP server for contact notifications
  try {
    const httpServer = initWorkerServer(client);
    await httpServer.start();
    log("http_server_ready", { port: process.env.WORKER_HTTP_PORT || "3001" });
  } catch (e) {
    logError("http_server_startup_failed", e);
  }

  // Heartbeat DB (le panel watchdog lit cette ligne via Prisma).
  // Indépendant du serveur HTTP : tient même si HTTP tombe.
  try {
    startHeartbeat();
  } catch (e) {
    logError("heartbeat_startup_failed", e);
  }

  // Schedule role sync if configured
  const syncEnabled = process.env.ROLE_SYNC_ENABLED === "true";
  if (syncEnabled) {
    log("sync_scheduled", { intervalMs: SYNC_INTERVAL_MS });
    
    // Run initial sync after 30 seconds
    setTimeout(() => runRoleSync(client), 30_000);
    
    // Schedule periodic sync
    setInterval(() => runRoleSync(client), SYNC_INTERVAL_MS);
  } else {
    log("sync_disabled", { message: "Set ROLE_SYNC_ENABLED=true to enable" });
  }

  // ─── Logs serveur ────────────────────────────────────────────────────────
  setupServerLogs(client);

  // ─── Mini-cache messages + anti-spam ─────────────────────────────────────
  client.on("messageCreate", (msg) => {
    if (!msg.author.bot) {
      cacheMessage(msg);
      handleAntispam(msg);
    }
  });


  // ─── Pré-chargement des messages existants ────────────────────────────────
  // Lance en arrière-plan après un court délai pour ne pas bloquer le démarrage
  setTimeout(async () => {
    try {
      const guildForCache = await client.guilds.fetch(guildId);
      await preCacheGuildMessages(guildForCache);
    } catch (err) {
      console.error("[Logs] Pré-cache guild introuvable :", err);
    }
  }, 1000);

  // Schedule LYG warn polling every 5 minutes
  let lastLygWarnPoll = 0;
  setInterval(() => {
    const now = Date.now();
    if (now - lastLygWarnPoll >= 60 * 60_000) {
      lastLygWarnPoll = now;
      pollLygWarns(client, prisma).catch((err) =>
        console.error("[lygWarnPoller] uncaught:", err)
      );
    }
  }, 60_000); // vérifié toutes les minutes, déclenché toutes les 60 min (budget LYG)

  // Schedule outbox processing
  log("outbox_scheduled", { intervalMs: OUTBOX_POLL_INTERVAL_MS });
  
  // Run initial outbox processing quickly at boot
  setTimeout(() => processOutboxQueue(prisma, client), 2_000);
  
  // Schedule periodic outbox processing
  setInterval(() => processOutboxQueue(prisma, client), OUTBOX_POLL_INTERVAL_MS);

  // Schedule banklogs auto-sync (server-side)
  const ingestBaseUrlForSync = process.env.INGEST_BASE_URL;
  if (isLegacyIngestUrl(ingestBaseUrlForSync)) {
    console.error("[BANKLOGS_AUTO_SYNC] disabled: INGEST_BASE_URL points to legacy domain", ingestBaseUrlForSync);
    log("banklogs_auto_sync_disabled", { reason: "legacy_domain", ingestBaseUrl: ingestBaseUrlForSync });
  } else {
    const banklogsIntervalMs = getBanklogsSyncIntervalMs();
    log("banklogs_auto_sync_scheduled", { intervalMs: banklogsIntervalMs });
    console.log("[BANKLOGS_AUTO_SYNC] scheduled (60s)");

    // Run initial sync after 15 seconds
    setTimeout(() => runBanklogsAutoSyncJob(), 15_000);

    // Schedule periodic sync
    setInterval(() => runBanklogsAutoSyncJob(), banklogsIntervalMs);

    // Health check: warn if auto-sync appears stalled.
    // Seuil adaptatif (avant : 120_000 ms hardcodés → bruit énorme car le sync
    // tourne toutes les 5 min, donc l'âge dépasse 2 min normalement entre runs).
    // intervalMs * 2 = stalled vraiment détecté seulement si on rate 2 cycles complets.
    setInterval(() => {
      const lastRun = getLastBanklogsAutoSyncAt();
      if (!lastRun) return;
      const isStalled = Date.now() - lastRun > banklogsIntervalMs * 2;
      if (isStalled) console.warn("[BANKLOGS_AUTO_SYNC] not running or stalled");
      trackStall("banklogs", isStalled, { lastRunIso: new Date(lastRun).toISOString() });
    }, 60_000);

    // Schedule members auto-sync on existing panel pipeline (members-only mode)
    const membersAutoSyncEnabled = process.env.MEMBERS_AUTO_SYNC_ENABLED !== "false";
    if (membersAutoSyncEnabled) {
      const membersIntervalMs = getMembersSyncIntervalMs();
      log("members_auto_sync_scheduled", { intervalMs: membersIntervalMs });

      // Run initial members sync shortly after boot
      setTimeout(() => runMembersAutoSyncJob(), 45_000);

      // Schedule periodic members sync
      setInterval(() => runMembersAutoSyncJob(), membersIntervalMs);

      // Health check: warn if members sync appears stalled
      setInterval(() => {
        const lastRun = getLastMembersAutoSyncAt();
        if (!lastRun) return;
        const isStalled = Date.now() - lastRun > membersIntervalMs * 2;
        if (isStalled) console.warn("[MEMBERS_AUTO_SYNC] not running or stalled");
        trackStall("members", isStalled, { lastRunIso: new Date(lastRun).toISOString() });
      }, 60_000);
    } else {
      log("members_auto_sync_disabled", { message: "Set MEMBERS_AUTO_SYNC_ENABLED=false to keep disabled" });
    }

    const infosIntervalMs = getInfosSyncIntervalMs();
    log("infos_auto_sync_scheduled", { intervalMs: infosIntervalMs });
    setTimeout(() => runInfosAutoSyncJob(), 30_000);
    // Bug fix : interval respecte maintenant la valeur env-driven (avant
    // hardcodé à 1h indépendamment de la config).
    setInterval(() => runInfosAutoSyncJob(), infosIntervalMs);
    setInterval(() => {
      const lastRun = getLastInfosAutoSyncAt();
      if (!lastRun) return;
      const isStalled = Date.now() - lastRun > infosIntervalMs * 2;
      if (isStalled) console.warn("[INFOS_AUTO_SYNC] not running or stalled");
      trackStall("infos", isStalled, { lastRunIso: new Date(lastRun).toISOString() });
    }, 60_000);

    const playtimeIntervalMs = getPlaytimeSyncIntervalMs();
    log("playtime_auto_sync_scheduled", { intervalMs: playtimeIntervalMs });
    setTimeout(() => runPlaytimeAutoSyncJob(), 60_000);
    // Bug fix : avant l'interval était hardcodé à 1h ignorant la valeur
    // calculée. Maintenant on respecte playtimeIntervalMs (default 10 min).
    setInterval(() => runPlaytimeAutoSyncJob(), playtimeIntervalMs);
    setInterval(() => {
      const lastRun = getLastPlaytimeAutoSyncAt();
      if (!lastRun) return;
      const isStalled = Date.now() - lastRun > playtimeIntervalMs * 2;
      if (isStalled) console.warn("[PLAYTIME_AUTO_SYNC] not running or stalled");
      trackStall("playtime", isStalled, { lastRunIso: new Date(lastRun).toISOString() });
    }, 60_000);

    // Cron : suppression auto des messages Discord d'absences expirées
    // (endAt < now). Tourne toutes les 15 min. Backed by the panel route
    // /api/staff/absences/expire-discord.
    const absencesExpireIntervalMs = getAbsencesExpireIntervalMs();
    log("absences_expire_scheduled", { intervalMs: absencesExpireIntervalMs });
    // 1er run 90s après boot, puis périodique
    setTimeout(() => runAbsencesExpireJob(), 90_000);
    setInterval(() => runAbsencesExpireJob(), absencesExpireIntervalMs);
    setInterval(() => {
      const lastRun = getLastAbsencesExpireAt();
      if (!lastRun) return;
      const isStalled = Date.now() - lastRun > absencesExpireIntervalMs * 2;
      if (isStalled) console.warn("[ABSENCES_EXPIRE] not running or stalled");
    }, 60_000);

    // Cron : sync de l'embed Hiérarchie dans #organigramme.
    // Toutes les 1 min — sync très rapide des promotions / démotes /
    // blacklists / arrivées. Pas d'appel LYG (que de la DB), donc le bumper
    // est "gratuit" côté quota.
    const hierarchyIntervalMs = 60_000;
    log("hierarchy_scheduled", { intervalMs: hierarchyIntervalMs });
    setTimeout(() => syncHierarchyMessage(client, prisma).catch((e) => console.error("[HIERARCHY] initial sync", e)), 60_000);
    setInterval(() => {
      syncHierarchyMessage(client, prisma).catch((e) => console.error("[HIERARCHY] sync", e));
    }, hierarchyIntervalMs);
  }
});

client.on("interactionCreate", async (interaction: Interaction) => {
  // ✅ Log ALL interactions
  console.log("[INTERACTION]", interaction.type, "id=" + interaction.id);

  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      return handleCommand(interaction, client);
    }

    // Panel buttons
    if (interaction.isButton()) {
      // ✅ Log button clicks
      console.log("[BUTTON]", interaction.customId, "user=" + interaction.user?.id, "channel=" + interaction.channelId);

      const startedAt = Date.now();

      // ─── Bouton règlement ─────────────────────────────────────────────────
      if (interaction.customId === REGLEMENT_ACCEPT_BUTTON) {
        return handleReglementAccept(interaction);
      }

      if (
        interaction.customId === CUSTOM_ID.PANEL_RECRUIT ||
        interaction.customId === LEGACY_TICKETS_PANEL_RECRUIT_ID
      ) {
        log("interaction", { type: "button", action: "open_recruitment_modal", userId: interaction.user.id });
        try {
          return await openRecruitmentModal(interaction);
        } finally {
          log("interaction_done", {
            type: "button",
            action: "open_recruitment_modal",
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            durationMs: Date.now() - startedAt,
          });
        }
      }
      if (
        interaction.customId === CUSTOM_ID.PANEL_COMPLAINT ||
        interaction.customId === LEGACY_TICKETS_PANEL_COMPLAINT_ID
      ) {
        log("interaction", { type: "button", action: "open_complaint_modal", userId: interaction.user.id });
        try {
          return await openComplaintModal(interaction);
        } finally {
          log("interaction_done", {
            type: "button",
            action: "open_complaint_modal",
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            durationMs: Date.now() - startedAt,
          });
        }
      }

      // Link panel button
      if (interaction.customId === CUSTOM_ID.LINK_OPEN_PANEL) {
        log("interaction", { type: "button", action: "open_link_panel", userId: interaction.user.id });
        // Redirect to link panel on web interface
        const panelUrl = `${IDS.PANEL_BASE_URL}/me?tab=link`;
        try {
          await interaction.deferReply({ ephemeral: true });
          await interaction.editReply({
            content: `🔗 Accès au panneau de liaison :\n${panelUrl}`,
          });
        } catch (e) {
          logError("interaction_error", e, {
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
          });
        } finally {
          log("interaction_done", {
            type: "button",
            action: "open_link_panel",
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            durationMs: Date.now() - startedAt,
          });
        }
        return;
      }

      // ⚡ CRITICAL: Link request buttons (linkreq:*) - SECURE HANDLER WITH ROLE CHECKS
      if (interaction.customId.startsWith("linkreq:")) {
        const startedAt = Date.now();
        
        // ✅ Guard 1: avoid double ACK if already deferred/replied
        if (interaction.deferred || interaction.replied) {
          console.log("[ACK_SKIP_ALREADY_ACKED]", interaction.customId);
          return;
        }

        // ✅ ACK IMMEDIATELY - before any async logic (critical for Discord)
        try {
          await interaction.deferUpdate();
          console.log("[ACK_OK]", interaction.customId);
        } catch (ackError) {
          console.error("[ACK_FAILED]", interaction.customId, ackError instanceof Error ? ackError.message : String(ackError));
          return;
        }

        // ✅ NOW process the action (ACK is already done, no Unknown Interaction errors)
        log("interaction", { type: "button", action: "linkreq", userId: interaction.user.id, customId: interaction.customId });
        
        try {
          // Parse customId format: linkreq:action:requestId:requesterId
          const parts = interaction.customId.split(":");
          if (parts.length < 4 || parts[0] !== "linkreq") {
            console.error("[linkreq error]", "Invalid format:", interaction.customId);
            await interaction.followUp({
              content: "❌ Format de bouton invalide.",
              ephemeral: true,
            });
            return;
          }

          const actionRaw = parts[1]; // open | refuse | archive (from button)
          const action: "accept" | "refuse" | "archive" = actionRaw === "open" ? "accept" : (actionRaw as "refuse" | "archive");
          const requestId = parts[2];
          const requesterDiscordId = parts[3];
          const clickerId = interaction.user.id;
          const clickerName = interaction.user.username || "Unknown";

          console.log("[LINKREQ_ACTION]", action, requestId, "clicker=" + clickerId);

          log("linkreq_button_clicked", {
            action,
            requestId,
            requesterDiscordId,
            clickerId,
            clickerName,
            channelId: interaction.channelId,
          });

          // Call handler with full context (includes role checks + security)
          const result = await handleLinkRequestAction(client, {
            requestId,
            requesterDiscordId,
            clickerId,
            clickerName,
            action,
            message: interaction.message,
            interaction,
          });

          // Handle permission errors
          if (!result.ok && result.reason) {
            console.log("[linkreq:permission_denied]", result.reason, {
              requestId,
              clickerId,
            });
            await interaction.followUp({
              content: `❌ ${result.reason}`,
              ephemeral: true,
            });
            return;
          }

          // Handle other errors
          if (!result.ok) {
            console.error("[linkreq:action_failed]", result.error, {
              requestId,
              action,
              clickerId,
            });
            await interaction.followUp({
              content: `❌ Erreur: ${result.error || "Action échouée"}`,
              ephemeral: true,
            });
            return;
          }

          // Success - already handled case
          if (result.alreadyHandled) {
            console.log("[linkreq:already_handled]", {
              requestId,
              status: result.status,
              clickerId,
            });
            await interaction.followUp({
              content: `ℹ️ Cette demande a déjà été traitée (statut: ${result.status})`,
              ephemeral: true,
            });
            return;
          }

          // Success - new action processed
          console.log("[linkreq:action_success]", {
            action,
            requestId,
            clickerId,
          });

          // Send channel notification
          try {
            await sendLinkRequestDecisionMessage(interaction.message, action, clickerId, requesterDiscordId);
          } catch (notifError) {
            console.warn("[linkreq:notification_failed]", notifError instanceof Error ? notifError.message : String(notifError));
          }

          // ✅ NEW: Send DM to user when accepted
          if (action === "accept") {
            try {
              await sendLinkAcceptedDM(client, requesterDiscordId);
            } catch (dmError) {
              console.warn("[linkreq:dm_failed]", dmError instanceof Error ? dmError.message : String(dmError));
              // Non-blocking: continue even if DM fails
            }
          }

          // Send ephemeral confirmation
          const confirmation = getActionConfirmation(action);
          await interaction.followUp({
            content: confirmation,
            ephemeral: true,
          });

        } catch (e) {
          console.error("[linkreq error]", e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
          try {
            const safeMessage = e instanceof Error ? e.message.substring(0, 100) : "Erreur inconnue";
            await interaction.followUp({
              content: `❌ Erreur interne: ${safeMessage}`,
              ephemeral: true,
            });
          } catch {
            // ignore followUp errors
          }

          log("linkreq_error", {
            customId: interaction.customId,
            error: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
          });
        } finally {
          log("interaction_done", {
            type: "button",
            action: "linkreq",
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            durationMs: Date.now() - startedAt,
          });
        }
        return;
      }

      // Staff buttons - recruitment and complaint decisions
      if (
        interaction.customId.startsWith(CUSTOM_ID.STAFF_RECRUIT_FINISH_PREFIX) ||
        interaction.customId.startsWith(CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX) ||
        interaction.customId.startsWith("recruitment:decide:") ||
        interaction.customId.startsWith("complaint:decide:")
      ) {
        log("interaction", { type: "button", action: "staff_decision", userId: interaction.user.id, customId: interaction.customId });
        
        // ✅ Route to appropriate handler based on customId
        const isRecruitment = 
          interaction.customId.startsWith(CUSTOM_ID.STAFF_RECRUIT_FINISH_PREFIX) ||
          interaction.customId.startsWith("recruitment:decide:");
        const isComplaint = 
          interaction.customId.startsWith(CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX) ||
          interaction.customId.startsWith("complaint:decide:");
        
        try {
          if (isRecruitment) {
            // New handler with idempotence, DB update, embed refresh, log posting
            return await handleRecruitmentDecision(interaction);
          } else if (isComplaint) {
            // New handler with idempotence, DB update, embed refresh, log posting
            return await handleComplaintDecision(interaction);
          } else {
            // Fallback to legacy handler for other staff buttons
            await interaction.deferReply({ ephemeral: true });
            return await handleStaffButtons(interaction);
          }
        } catch (e) {
          console.error("[staff button error]", e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
          try {
            const safeMessage = e instanceof Error ? e.message.substring(0, 100) : "Une erreur est survenue";
            
            // Handle reply safely based on interaction state
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                content: `❌ Erreur: ${safeMessage}`,
                flags: MessageFlags.Ephemeral,
              });
            } else if (interaction.deferred) {
              await interaction.editReply(`❌ Erreur: ${safeMessage}`);
            } else {
              await interaction.followUp({
                content: `❌ Erreur: ${safeMessage}`,
                flags: MessageFlags.Ephemeral,
              });
            }
          } catch {
            // ignore
          }
        } finally {
          log("interaction_done", {
            type: "button",
            action: "staff_decision",
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            durationMs: Date.now() - startedAt,
          });
        }
        return;
      }

      // ⚡ CRITICAL: Link management buttons - handle lifecycle carefully
      if (
        interaction.customId.startsWith(LINK_CUSTOM_IDS.LINK_BUTTON) ||
        interaction.customId.startsWith(LINK_CUSTOM_IDS.DELETE_BUTTON) ||
        interaction.customId.startsWith(LINK_CUSTOM_IDS.CANCEL_BUTTON) ||
        interaction.customId.startsWith(LINK_CUSTOM_IDS.CONFIRM_DELETE_BUTTON) ||
        interaction.customId.startsWith("link:action:") ||
        interaction.customId.startsWith("link:confirm:")
      ) {
        log("interaction", { type: "button", action: "link_management", userId: interaction.user.id });
        
        // ✅ Check if this is a modal-opening action (LINK_BUTTON = "link:req:modify")
        // If so, DON'T deferUpdate - showModal() is an immediate response
        const isModalAction = interaction.customId.startsWith(LINK_CUSTOM_IDS.LINK_BUTTON);
        
        if (!isModalAction) {
          // For other actions (delete, cancel confirmation), ACK with deferUpdate
          try {
            await interaction.deferUpdate();
            console.log("[ACK_OK]", interaction.customId);
          } catch (ackError) {
            console.error("[ACK_FAILED]", interaction.customId, ackError instanceof Error ? ackError.message : String(ackError));
            return;
          }
        }

        // Now handle the interaction
        try {
          return await handleLinkButtonInteraction(interaction, client);
        } catch (e) {
          console.error("[linkreq error]", e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
          try {
            const safeMessage = e instanceof Error ? e.message.substring(0, 100) : "Une erreur est survenue";
            // Use reply() if not deferred/replied, otherwise use followUp()
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                content: `❌ Erreur: ${safeMessage}`,
                flags: MessageFlags.Ephemeral,
              });
            } else {
              await interaction.followUp({
                content: `❌ Erreur: ${safeMessage}`,
                flags: MessageFlags.Ephemeral,
              });
            }
          } catch {
            // ignore followUp errors
          }
        } finally {
          log("interaction_done", {
            type: "button",
            action: "link_management",
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            durationMs: Date.now() - startedAt,
          });
        }
      }

      // ⚡ CRITICAL: Unlink buttons - deferUpdate IMMEDIATELY
      if (
        interaction.customId.startsWith("unlink:confirm:") ||
        interaction.customId.startsWith("unlink:cancel:")
      ) {
        log("interaction", { type: "button", action: "unlink_management", userId: interaction.user.id });
        
        // ✅ IMMEDIATE ACK - must complete within 3 seconds
        try {
          await interaction.deferUpdate();
          console.log("[ACK_OK]", interaction.customId);
        } catch (ackError) {
          console.error("[ACK_FAILED]", interaction.customId, ackError instanceof Error ? ackError.message : String(ackError));
          return;
        }

        // Now handle the interaction
        try {
          return await handleUnlinkButtonInteraction(interaction, client);
        } catch (e) {
          console.error("[unlink error]", e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
          try {
            const safeMessage = e instanceof Error ? e.message.substring(0, 100) : "Une erreur est survenue";
            await interaction.followUp({
              content: `❌ Erreur: ${safeMessage}`,
              ephemeral: true,
            });
          } catch {
            // ignore followUp errors
          }
        } finally {
          log("interaction_done", {
            type: "button",
            action: "unlink_management",
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            durationMs: Date.now() - startedAt,
          });
        }
      }
    }

    // Modals submit
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith(CUSTOM_ID.MODAL_RECRUIT)) {
        log("interaction", { type: "modal", action: "recruitment_submit", userId: interaction.user.id });
        return handleRecruitmentSubmit(interaction);
      }
      if (interaction.customId === CUSTOM_ID.MODAL_COMPLAINT) {
        log("interaction", { type: "modal", action: "complaint_submit", userId: interaction.user.id });
        return handleComplaintSubmit(interaction);
      }

      // Link management modal
      if (interaction.customId.startsWith(LINK_CUSTOM_IDS.LINK_MODAL)) {
        log("interaction", { type: "modal", action: "link_submit", userId: interaction.user.id });
        return handleLinkModalSubmission(interaction, client);
      }
    }
  } catch (e: unknown) {
    logError("interaction_error", e, { 
      userId: interaction.user?.id,
      type: interaction.type,
    });
    if (interaction.isRepliable()) {
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: "❌ Erreur interne.",
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "❌ Erreur interne.",
            ephemeral: true,
          });
        }
      } catch {
        // ignore
      }
    }
  }
});

client.login(must("DISCORD_TOKEN"));
