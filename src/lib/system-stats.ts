import "server-only";
import os from "node:os";
import { promises as fs } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export type SystemStats = {
  hostname: string;
  uptimeSec: number;
  loadAvg: [number, number, number];
  cpu: { count: number; model: string; usagePercent: number };
  memory: { totalMB: number; usedMB: number; freeMB: number; usedPercent: number };
  disk: { totalGB: number; usedGB: number; freeGB: number; usedPercent: number } | null;
  services: Array<{ name: string; status: "active" | "inactive" | "failed" | "unknown"; type: "systemd" | "pm2" }>;
  node: { version: string; pid: number; rssMB: number };
};

// Échantillon CPU partagé en arrière-plan pour éviter les pics artificiels.
// Mesure sur ~1.5s, mise à jour toutes les 5s.
const cpuG = globalThis as unknown as {
  __cpuSampler?: { last: number; updatedAt: number; running: boolean };
};
cpuG.__cpuSampler ??= { last: 0, updatedAt: 0, running: false };

async function sampleCpuOnce(): Promise<number> {
  const start = os.cpus().map((c) => ({ ...c.times }));
  await new Promise((r) => setTimeout(r, 1500));
  const end = os.cpus().map((c) => ({ ...c.times }));
  let totalIdle = 0;
  let totalTick = 0;
  for (let i = 0; i < start.length; i++) {
    const s = start[i];
    const e = end[i];
    const idle = e.idle - s.idle;
    const total = (e.user + e.nice + e.sys + e.idle + e.irq) - (s.user + s.nice + s.sys + s.idle + s.irq);
    totalIdle += idle;
    totalTick += total;
  }
  if (totalTick === 0) return 0;
  return Math.round((1 - totalIdle / totalTick) * 100);
}

async function getCpuUsage(): Promise<number> {
  const sampler = cpuG.__cpuSampler!;
  // Si frais (<5s), on retourne la dernière mesure
  if (Date.now() - sampler.updatedAt < 5000) return sampler.last;
  // Si déjà en cours d'échantillonnage, on retourne le dernier connu
  if (sampler.running) return sampler.last;

  sampler.running = true;
  try {
    const value = await sampleCpuOnce();
    sampler.last = value;
    sampler.updatedAt = Date.now();
    return value;
  } finally {
    sampler.running = false;
  }
}

async function getDiskUsage(): Promise<SystemStats["disk"]> {
  try {
    const { stdout } = await execAsync("df -BG --output=size,used,avail / | tail -n 1", { timeout: 3000 });
    const parts = stdout.trim().split(/\s+/);
    const totalGB = parseInt(parts[0]);
    const usedGB = parseInt(parts[1]);
    const freeGB = parseInt(parts[2]);
    return {
      totalGB, usedGB, freeGB,
      usedPercent: Math.round((usedGB / totalGB) * 100),
    };
  } catch {
    return null;
  }
}

async function getServiceStatus(name: string, type: "systemd" | "pm2"): Promise<"active" | "inactive" | "failed" | "unknown"> {
  try {
    if (type === "systemd") {
      const { stdout } = await execAsync(`systemctl is-active ${name} 2>&1`, { timeout: 3000 });
      const s = stdout.trim();
      if (s === "active") return "active";
      if (s === "inactive") return "inactive";
      if (s === "failed") return "failed";
      return "unknown";
    } else {
      const { stdout } = await execAsync(`pm2 jlist 2>/dev/null`, { timeout: 3000 });
      const list = JSON.parse(stdout);
      const proc = list.find((p: any) => p.name === name);
      if (!proc) return "inactive";
      return proc.pm2_env?.status === "online" ? "active" : "failed";
    }
  } catch {
    return "unknown";
  }
}

export async function collectSystemStats(): Promise<SystemStats> {
  const [cpuUsage, disk, panelStatus, workerStatus, gmodStatus] = await Promise.all([
    getCpuUsage(),
    getDiskUsage(),
    getServiceStatus("panel-esperados.service", "systemd"),
    getServiceStatus("discord-worker.service", "systemd"),
    getServiceStatus("gmod.service", "systemd"),
  ]);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsage = process.memoryUsage();

  const cpus = os.cpus();
  return {
    hostname: "vps", // hostname masqué pour sécurité
    uptimeSec: Math.floor(os.uptime()),
    loadAvg: os.loadavg() as [number, number, number],
    cpu: {
      count: cpus.length,
      model: cpus[0]?.model.trim() ?? "unknown",
      usagePercent: cpuUsage,
    },
    memory: {
      totalMB: Math.round(totalMem / 1024 / 1024),
      usedMB: Math.round(usedMem / 1024 / 1024),
      freeMB: Math.round(freeMem / 1024 / 1024),
      usedPercent: Math.round((usedMem / totalMem) * 100),
    },
    disk,
    services: [
      { name: "panel-esperados", status: panelStatus, type: "systemd" },
      { name: "discord-worker", status: workerStatus, type: "systemd" },
      { name: "gmod (serveur de jeu)", status: gmodStatus, type: "systemd" },
    ],
    node: {
      version: process.version,
      pid: process.pid,
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
    },
  };
}
