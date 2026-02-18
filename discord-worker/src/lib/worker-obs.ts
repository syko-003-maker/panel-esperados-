/**
 * Production-ready observability module for Discord worker
 * - JobId and requestId generation and tracking
 * - Structured JSON logging with timestamps
 * - Consistent error serialization
 */

import { randomUUID } from "crypto";

export function makeJobId(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (!err) return {};

  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  if (typeof err === "object") {
    return {
      type: typeof err,
      value: String(err),
    };
  }

  return {
    value: String(err),
  };
}

function createLogEntry(
  level: LogLevel,
  event: string,
  data?: Record<string, any>,
  err?: unknown
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };

  if (err) {
    entry.error = serializeError(err);
  }

  return entry;
}

export function logInfo(event: string, data?: Record<string, any>): void {
  const entry = createLogEntry("info", event, data);
  console.log(JSON.stringify(entry));
}

export function logWarn(event: string, data?: Record<string, any>): void {
  const entry = createLogEntry("warn", event, data);
  console.warn(JSON.stringify(entry));
}

export function logError(
  event: string,
  data?: Record<string, any>,
  err?: unknown
): void {
  const entry = createLogEntry("error", event, data, err);
  console.error(JSON.stringify(entry));
}
