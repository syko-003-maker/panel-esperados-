import { useEffect, useRef, useState, useCallback } from "react";

type Complaint = {
  id: string;
  channelId: string;
  status: "OPEN" | "TREATED" | "UNTREATED" | "CLOSED";
  createdAtDiscord: string;
};

type Recruitment = {
  id: string;
  ticketKey: string;
  status: "OPEN" | "FINI";
  rpName: string | null;
  authorTag: string | null;
  createdAt: string;
};

type Sanction = {
  id: string;
  memberId: string;
  type: string;
  status: "ACTIVE" | "EXPIRED" | "CLOSED";
  reason: string | null;
  createdAt: string;
};

type DashboardData = {
  complaints: Complaint[];
  recruitments: Recruitment[];
  sanctions: Sanction[];
  membersCount: number;
  membersSource: "lyg" | "db_stale" | null;
  membersError: string | null;
};

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const isDev = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

const log = (msg: string, data?: any) => {
  if (isDev) console.log(`[dashboard] ${msg}`, data ?? "");
};

class DashboardDataManager {
  private cache = new Map<string, CacheEntry<any>>();
  private inflightRequests = new Map<string, Promise<any>>();
  private abortControllers = new Map<string, AbortController>();
  private requestId = this.generateRequestId();

  private generateRequestId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // Cache TTL in ms: members cached longer (60s), others 30s
  private getTTL(section: string): number {
    return section === "members" ? 60_000 : 30_000;
  }

  private buildHeaders(section: string) {
    return {
      "x-dashboard-request-id": this.requestId,
      "x-dashboard-section": section,
    };
  }

  private getCacheKey(section: string): string {
    return `dashboard:${section}`;
  }

  private isCacheValid(section: string): boolean {
    const key = this.getCacheKey(section);
    const entry = this.cache.get(key);
    if (!entry) return false;
    const isValid = entry.expiresAt > Date.now();
    if (!isValid) this.cache.delete(key);
    return isValid;
  }

  private setCacheEntry(section: string, data: any): void {
    const key = this.getCacheKey(section);
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.getTTL(section),
    });
    log(`cache_set: ${section}`);
  }

  private getCacheEntry(section: string): any | null {
    const key = this.getCacheKey(section);
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      log(`cache_hit: ${section}`);
      return entry.data;
    }
    return null;
  }

  private setInflight(section: string, promise: Promise<any>): void {
    this.inflightRequests.set(section, promise);
    log(`inflight_start: ${section}`);
  }

  private clearInflight(section: string): void {
    this.inflightRequests.delete(section);
    log(`inflight_end: ${section}`);
  }

  private getInflight(section: string): Promise<any> | null {
    return this.inflightRequests.get(section) ?? null;
  }

  private cancelFetch(section: string): void {
    const abort = this.abortControllers.get(section);
    if (abort) {
      abort.abort();
      this.abortControllers.delete(section);
      log(`fetch_cancelled: ${section}`);
    }
  }

  async fetchSection(section: string, url: string): Promise<any> {
    // Check if already cached
    if (this.isCacheValid(section)) {
      return this.getCacheEntry(section);
    }

    // Check if already inflight
    const inflight = this.getInflight(section);
    if (inflight) {
      log(`using_inflight: ${section}`);
      return inflight;
    }

    // Cancel any previous request for this section
    this.cancelFetch(section);

    // Create new AbortController
    const abort = new AbortController();
    this.abortControllers.set(section, abort);

    // Make the fetch
    const promise = (async () => {
      try {
        log(`fetch_start: ${section}`);
        const res = await fetch(url, {
          cache: "no-store",
          headers: this.buildHeaders(section),
          signal: abort.signal,
        });

        if (!res.ok) {
          log(`fetch_error: ${section} (${res.status})`);
          return null;
        }

        const json = await res.json();
        log(`fetch_success: ${section}`);
        this.setCacheEntry(section, json);
        return json;
      } catch (err: any) {
        if (err.name === "AbortError") {
          log(`fetch_aborted: ${section}`);
          return null;
        }
        log(`fetch_exception: ${section}`, err.message);
        return null;
      } finally {
        this.clearInflight(section);
      }
    })();

    this.setInflight(section, promise);
    return promise;
  }

  async loadDashboard(forceRefresh = false): Promise<DashboardData> {
    if (forceRefresh) {
      log("force_refresh: clearing all caches");
      this.cache.clear();
      this.requestId = this.generateRequestId();
    }

    log("load_dashboard_start");

    const [complaintsRes, recruitmentsRes, sanctionsRes, membersRes] = await Promise.all([
      this.fetchSection("complaints", "/api/staff/complaints?status=OPEN&pageSize=5&lite=1"),
      this.fetchSection("recruitments", "/api/staff/list/recruitments?status=OPEN&limit=5"),
      this.fetchSection("sanctions", "/api/staff/sanctions?status=ACTIVE&pageSize=5"),
      this.fetchSection("members", "/api/staff/members?countOnly=1"),
    ]);

    const result: DashboardData = {
      complaints: (complaintsRes?.data || []).slice(0, 5),
      recruitments: recruitmentsRes?.data || [],
      sanctions: sanctionsRes?.data || [],
      membersCount: membersRes?.count ?? 0,
      membersSource: (membersRes?.source as any) ?? null,
      membersError: membersRes?.error ?? null,
    };

    log("load_dashboard_end", {
      complaints: result.complaints.length,
      recruitments: result.recruitments.length,
      sanctions: result.sanctions.length,
      membersCount: result.membersCount,
      membersSource: result.membersSource,
    });

    return result;
  }

  cleanup(): void {
    log("cleanup: cancelling all inflight requests");
    this.inflightRequests.forEach((_, section) => {
      this.cancelFetch(section);
    });
    this.inflightRequests.clear();
  }
}

// Singleton instance
let dashboardManager: DashboardDataManager | null = null;

function getDashboardManager(): DashboardDataManager {
  if (!dashboardManager) {
    dashboardManager = new DashboardDataManager();
  }
  return dashboardManager;
}

export function useDashboardData() {
  const [data, setData] = useState<DashboardData>({
    complaints: [],
    recruitments: [],
    sanctions: [],
    membersCount: 0,
    membersSource: null,
    membersError: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitializedRef = useRef(false);
  const managerRef = useRef(getDashboardManager());

  // Load data on mount
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    log("mount: initial load");
    (async () => {
      try {
        setError(null);
        const result = await managerRef.current.loadDashboard(false);
        setData(result);
      } catch (err: any) {
        log("mount_error", err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      log("unmount: cleanup");
      managerRef.current.cleanup();
    };
  }, []);

  const refresh = useCallback(
    async (forceAll = true) => {
      log(`refresh_requested (forceAll=${forceAll})`);
      setLoading(true);
      try {
        setError(null);
        const result = await managerRef.current.loadDashboard(forceAll);
        setData(result);
      } catch (err: any) {
        log("refresh_error", err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { data, loading, error, refresh };
}
