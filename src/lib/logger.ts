/**
 * ✅ MEGA PATCH #2: Throttled Logger
 * 
 * Réduit le spam de logs en production et throttle en dev.
 * Chaque topic peut loguer max 1x / interval (défaut 5s).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerOptions {
  throttleMs?: number; // Default 5000ms (5s)
  enableInProduction?: boolean; // Default false
}

class ThrottledLogger {
  private lastLogAt: Map<string, number> = new Map();
  private throttleMs: number;
  private enableInProduction: boolean;

  constructor(opts: LoggerOptions = {}) {
    this.throttleMs = opts.throttleMs ?? 5000;
    this.enableInProduction = opts.enableInProduction ?? false;
  }

  private shouldLog(topic: string): boolean {
    const isProd = process.env.NODE_ENV === "production";
    if (isProd && !this.enableInProduction) {
      return false;
    }

    const now = Date.now();
    const lastLog = this.lastLogAt.get(topic) ?? 0;
    const canLog = now - lastLog >= this.throttleMs;

    if (canLog) {
      this.lastLogAt.set(topic, now);
    }

    return canLog;
  }

  debug(topic: string, message: string, data?: any) {
    if (this.shouldLog(topic)) {
      console.log(`[${topic}] ${message}`, data ?? "");
    }
  }

  info(topic: string, message: string, data?: any) {
    if (this.shouldLog(topic)) {
      console.log(`[${topic}] ℹ️ ${message}`, data ?? "");
    }
  }

  warn(topic: string, message: string, data?: any) {
    if (this.shouldLog(topic)) {
      console.warn(`[${topic}] ⚠️ ${message}`, data ?? "");
    }
  }

  error(topic: string, message: string, data?: any) {
    // Errors always log
    console.error(`[${topic}] ❌ ${message}`, data ?? "");
  }

  immediate(topic: string, message: string, data?: any) {
    // Bypass throttle (for one-time events)
    console.log(`[${topic}] 🔔 ${message}`, data ?? "");
  }
}

export const logger = new ThrottledLogger({
  throttleMs: 5000,
  enableInProduction: false,
});

export function debug(...args: any[]) {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
}

export function warn(...args: any[]) {
  console.warn(...args);
}

export function error(...args: any[]) {
  console.error(...args);
}
