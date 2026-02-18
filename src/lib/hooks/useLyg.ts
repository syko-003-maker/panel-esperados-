/**
 * React hooks for LYG API with auto-refresh and caching
 * 
 * These hooks provide:
 * - Auto-refresh with configurable intervals
 * - Manual refresh trigger
 * - Loading states
 * - Error handling
 * - Tab deduplication via server-side cache
 * 
 * Rate limit protection:
 * - Server-side cache prevents hitting LYG rate limit
 * - Multiple tabs share the same server cache
 * - Background refresh keeps data fresh
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ============================================================================
// TYPES
// ============================================================================

interface LygMember {
  steamId64: string;
  family?: string;
  rank?: string;
  owner?: boolean;
  rpName?: string;
  grade?: string;
  joinedAt?: any;
  isActive?: boolean;
  discordId?: string;
}

interface CachedResponse<T> {
  ok: boolean;
  data: T;
  cached: boolean;
  fetchedAt: string;
  ttlMs: number;
  error?: string;
}

// ============================================================================
// useMembers Hook
// ============================================================================

interface UseMembersOptions {
  familyId?: string;
  refreshInterval?: number; // milliseconds, default: 30min
  enabled?: boolean; // control whether to fetch
}

interface UseMembersResult {
  members: LygMember[];
  loading: boolean;
  error: string | null;
  cached: boolean;
  fetchedAt: Date | null;
  refresh: () => void;
}

const DEFAULT_MEMBERS_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch family members with auto-refresh
 * 
 * @example
 * ```tsx
 * const { members, loading, error, refresh } = useMembers({
 *   familyId: "esperados",
 *   refreshInterval: 30 * 60 * 1000, // 30 min
 * });
 * ```
 */
export function useMembers(options: UseMembersOptions = {}): UseMembersResult {
  const {
    familyId = "esperados",
    refreshInterval = DEFAULT_MEMBERS_REFRESH_INTERVAL,
    enabled = true,
  } = options;

  const [members, setMembers] = useState<LygMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMembers = useCallback(
    async (force = false) => {
      if (!enabled) return;

      try {
        setLoading(true);
        setError(null);

        const url = `/api/lyg/members?familyId=${familyId}${force ? "&force=true" : ""}`;
        const response = await fetch(url);
        const data: CachedResponse<LygMember[]> = await response.json();

        if (!data.ok) {
          throw new Error(data.error ?? "Failed to fetch members");
        }

        setMembers(data.data);
        setCached(data.cached);
        setFetchedAt(new Date(data.fetchedAt));
        setError(null);
      } catch (err: any) {
        console.error("[useMembers] Fetch error:", err);
        setError(err.message ?? "Failed to fetch members");
      } finally {
        setLoading(false);
      }
    },
    [familyId, enabled]
  );

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Initial fetch + refresh trigger
  useEffect(() => {
    if (!enabled) return;

    fetchMembers(false);
  }, [fetchMembers, refreshTrigger, enabled]);

  // Auto-refresh interval
  useEffect(() => {
    if (!enabled) return;
    if (!refreshInterval || refreshInterval <= 0) return;

    refreshIntervalRef.current = setInterval(() => {
      fetchMembers(false);
    }, refreshInterval);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [fetchMembers, refreshInterval, enabled]);

  return {
    members,
    loading,
    error,
    cached,
    fetchedAt,
    refresh,
  };
}

// ============================================================================
// useBanklogs Hook
// ============================================================================

interface UseBanklogsOptions {
  familyId?: string;
  refreshInterval?: number; // milliseconds, default: 60s
  enabled?: boolean;
}

interface UseBanklogsResult {
  banklogs: any;
  loading: boolean;
  error: string | null;
  cached: boolean;
  fetchedAt: Date | null;
  refresh: () => void;
}

const DEFAULT_BANKLOGS_REFRESH_INTERVAL = 60 * 1000; // 60 seconds

/**
 * Fetch family banklogs with auto-refresh
 * 
 * @example
 * ```tsx
 * const { banklogs, loading, error, refresh } = useBanklogs({
 *   familyId: "esperados",
 *   refreshInterval: 60 * 1000, // 60s
 * });
 * ```
 */
export function useBanklogs(
  options: UseBanklogsOptions = {}
): UseBanklogsResult {
  const {
    familyId = "esperados",
    refreshInterval = DEFAULT_BANKLOGS_REFRESH_INTERVAL,
    enabled = true,
  } = options;

  const [banklogs, setBanklogs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBanklogs = useCallback(
    async (force = false) => {
      if (!enabled) return;

      try {
        setLoading(true);
        setError(null);

        const url = `/api/lyg/banklogs?familyId=${familyId}${force ? "&force=true" : ""}`;
        const response = await fetch(url);
        const data: CachedResponse<any> = await response.json();

        if (!data.ok) {
          throw new Error(data.error ?? "Failed to fetch banklogs");
        }

        setBanklogs(data.data);
        setCached(data.cached);
        setFetchedAt(new Date(data.fetchedAt));
        setError(null);
      } catch (err: any) {
        console.error("[useBanklogs] Fetch error:", err);
        setError(err.message ?? "Failed to fetch banklogs");
      } finally {
        setLoading(false);
      }
    },
    [familyId, enabled]
  );

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  // Initial fetch + refresh trigger
  useEffect(() => {
    if (!enabled) return;

    fetchBanklogs(false);
  }, [fetchBanklogs, refreshTrigger, enabled]);

  // Auto-refresh interval
  useEffect(() => {
    if (!enabled) return;
    if (!refreshInterval || refreshInterval <= 0) return;

    refreshIntervalRef.current = setInterval(() => {
      fetchBanklogs(false);
    }, refreshInterval);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [fetchBanklogs, refreshInterval, enabled]);

  return {
    banklogs,
    loading,
    error,
    cached,
    fetchedAt,
    refresh,
  };
}
