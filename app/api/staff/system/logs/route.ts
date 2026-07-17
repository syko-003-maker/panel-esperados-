import { NextResponse } from "next/server";
import { requireChefOrEtatMajor, requireChefFamille } from "@/lib/guards";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

type LogLine = { timestamp: string | null; level: "error" | "warn" | "info"; message: string };

const ALLOWED_SOURCES = ["panel", "worker"] as const;
type Source = (typeof ALLOWED_SOURCES)[number];

function detectLevel(line: string): LogLine["level"] {
  const l = line.toLowerCase();
  if (/\b(error|fatal|failed|exception|crash|✗|❌)\b/.test(l)) return "error";
  if (/\b(warn|warning|429|rate.?limit|⚠|deprecated)\b/.test(l)) return "warn";
  return "info";
}

function parseJournalLine(line: string): LogLine | null {
  // Format journalctl --output=short-iso: "2026-04-27T17:18:00+0000 host npm[2924267]: message"
  const m = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:?\d{2})\s+\S+\s+\S+:\s*(.*)$/);
  if (m) {
    return { timestamp: m[1], level: detectLevel(m[2]), message: m[2] };
  }
  return { timestamp: null, level: detectLevel(line), message: line };
}


async function fetchLogs(source: Source, limit: number): Promise<LogLine[]> {
  try {
    if (source === "panel") {
      const { stdout } = await execAsync(
        `journalctl -u panel-esperados.service -n ${limit} --no-pager --output=short-iso 2>&1`,
        { timeout: 5000, maxBuffer: 2 * 1024 * 1024 }
      );
      return stdout.split("\n").filter(Boolean).map(parseJournalLine).filter((x): x is LogLine => x !== null);
    }
    if (source === "worker") {
      const { stdout } = await execAsync(
        `journalctl -u discord-worker.service -n ${limit} --no-pager --output=short-iso 2>&1`,
        { timeout: 5000, maxBuffer: 2 * 1024 * 1024 }
      );
      return stdout.split("\n").filter(Boolean).map(parseJournalLine).filter((x): x is LogLine => x !== null);
    }
    return [];
  } catch (err: any) {
    return [{ timestamp: null, level: "error", message: `Erreur lecture logs (${source}): ${err.message}` }];
  }
}

export async function GET(req: Request) {
  const guard = await requireChefFamille();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const sourceParam = (searchParams.get("source") ?? "panel") as Source;
  const source: Source = ALLOWED_SOURCES.includes(sourceParam) ? sourceParam : "panel";
  const limit = Math.min(500, Math.max(20, parseInt(searchParams.get("limit") ?? "150")));
  const filter = (searchParams.get("filter") ?? "all").toLowerCase(); // all|errors|warns|lyg

  let logs = await fetchLogs(source, limit);

  if (filter === "errors") {
    logs = logs.filter((l) => l.level === "error");
  } else if (filter === "warns") {
    logs = logs.filter((l) => l.level === "warn" || l.level === "error");
  } else if (filter === "lyg") {
    logs = logs.filter((l) => /lyg|429|online-status|warnPoller|rate.?limit/i.test(l.message));
  }

  // On garde les N dernières après filtre
  const trimmed = logs.slice(-200);

  return NextResponse.json({ ok: true, source, count: trimmed.length, logs: trimmed });
}
