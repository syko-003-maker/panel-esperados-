// scripts/discord-worker.ts
"use strict";

import path from "path";
import dotenv from "dotenv";

// Load .env.local FIRST (highest priority for secrets)
const localEnv = dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
console.log("[discord-worker] .env.local loaded:", localEnv.parsed ? "YES" : "NO");

// Load .env as fallback
const defaultEnv = dotenv.config({ path: path.resolve(process.cwd(), ".env") });
console.log("[discord-worker] .env loaded:", defaultEnv.parsed ? "YES" : "NO");

// Validate critical env vars
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

console.log("\n[discord-worker] Environment validation:");
console.log("  DISCORD_BOT_TOKEN:", TOKEN ? `✓ present (${TOKEN.length} chars)` : "✗ MISSING");
console.log("  DISCORD_GUILD_ID:", GUILD_ID ? `✓ ${GUILD_ID}` : "✗ MISSING");
console.log("  DISCORD_TICKET_PARENT_CHANNEL_ID:", process.env.DISCORD_TICKET_PARENT_CHANNEL_ID || "✗ MISSING");
console.log("  DISCORD_LOGS_CHANNEL_ID:", process.env.DISCORD_LOGS_CHANNEL_ID || "✗ MISSING");

if (!TOKEN || TOKEN === "xxxx" || TOKEN.length < 50) {
  console.error("\n❌ [discord-worker] FATAL: Invalid or missing DISCORD_BOT_TOKEN");
  console.error("   → Check .env.local file");
  console.error("   → Token must be 70+ chars");
  process.exit(1);
}

if (!GUILD_ID) {
  console.error("\n❌ [discord-worker] FATAL: Missing DISCORD_GUILD_ID");
  process.exit(1);
}

console.log("\n[discord-worker] Starting worker...\n");

// Global error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("[discord-worker] ⚠️ Unhandled Rejection:", reason);
  console.error("[discord-worker] Promise:", promise);
});

process.on("uncaughtException", (error) => {
  console.error("[discord-worker] ⚠️ Uncaught Exception:", error);
  console.error("[discord-worker] Stack:", error instanceof Error ? error.stack : "N/A");
});

// Robust ESM/CJS interop loader
async function start() {
  try {
    const WORKER_PATH = '../apps/discord/worker';
    const mod = await import(WORKER_PATH);
    
    console.log('[discord-worker] Module loaded from:', WORKER_PATH);
    console.log('[discord-worker] Root exports:', Object.keys(mod));
    
    // Resolution order: try various export patterns
    let runDiscordWorker: any = null;
    
    // 1. Named export: mod.runDiscordWorker
    if (typeof mod.runDiscordWorker === 'function') {
      console.log('[discord-worker] Found: mod.runDiscordWorker (named export)');
      runDiscordWorker = mod.runDiscordWorker;
    }
    
    // 2. Default with nested named export: mod.default?.runDiscordWorker
    else if (mod.default && typeof mod.default.runDiscordWorker === 'function') {
      console.log('[discord-worker] Found: mod.default.runDiscordWorker');
      runDiscordWorker = mod.default.runDiscordWorker;
    }
    
    // 3. CommonJS interop: mod["module.exports"]?.runDiscordWorker
    else if (mod['module.exports'] && typeof mod['module.exports'].runDiscordWorker === 'function') {
      console.log('[discord-worker] Found: mod["module.exports"].runDiscordWorker (CommonJS)');
      runDiscordWorker = mod['module.exports'].runDiscordWorker;
    }
    
    // 4. Nested CommonJS: mod.default?.["module.exports"]?.runDiscordWorker
    else if (mod.default?.['module.exports'] && typeof mod.default['module.exports'].runDiscordWorker === 'function') {
      console.log('[discord-worker] Found: mod.default["module.exports"].runDiscordWorker');
      runDiscordWorker = mod.default['module.exports'].runDiscordWorker;
    }
    
    // 5. Default is the function itself
    else if (typeof mod.default === 'function') {
      console.log('[discord-worker] Found: mod.default (function) - using as runDiscordWorker');
      runDiscordWorker = mod.default;
    }
    
    // Not found - detailed error
    if (typeof runDiscordWorker !== 'function') {
      console.error('❌ [discord-worker] runDiscordWorker not found!');
      console.error('\nDiagnostics:');
      console.error('  Root keys:', Object.keys(mod));
      if (mod.default) console.error('  mod.default keys:', Object.keys(mod.default));
      if (mod['module.exports']) console.error('  mod["module.exports"] keys:', Object.keys(mod['module.exports']));
      process.exit(1);
    }
    
    console.log('[discord-worker] Calling runDiscordWorker()...\n');
    await runDiscordWorker();
    
    // ✅ Worker is now long-running and should never reach here
    // If we do, it means the worker exited unexpectedly
    console.warn('[discord-worker] ⚠️ Worker exited unexpectedly');
    process.exit(0);
    
  } catch (err) {
    console.error('❌ [discord-worker] Fatal error:', err);
    process.exit(1);
  }
}

start();
