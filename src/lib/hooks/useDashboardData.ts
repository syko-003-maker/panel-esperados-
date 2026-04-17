// /lib/hooks/useDashboardData.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============================================================================
// TYPES
// ============================================================================

type Complaint = {
  id: string;
  ticketKey: string | null;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED" | "CLOSED";
  createdAt: string;
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

type PendingAbsence = {
  id: string;
  memberId: string | null;
  member: { rpName: string } | null;
  startAt: string;
  endAt: string;
  type: string;
};

type MembersCountResp = {
  ok: boolean;
  familyId?: string;
  count?: number;
  source?: "lyg" | "db_stale";
  error?: string;
};

/**
 * IMPORTANT: DashboardData est GARANTI de ne jamais être undefined
 * Toutes les propriétés ont des valeurs par défaut
 */
export type DashboardData = {
  complaints: Complaint[];
  recruitments: Recruitment[];
  sanctions: Sanction[];
  pendingAbsences: PendingAbsence[];
  membersCount: number;
  membersSource: "lyg" | "db_stale" | null;
  membersError: string | null;
};

type CacheEntry<T> = { at: number; value: T };

// ============================================================================
// CONSTANTS
// ============================================================================

const TTL_DEFAULT_MS = 30_000; // 30 secondes
const TTL_MEMBERS_MS = 60_000; // 60 secondes
const REQUEST_TIMEOUT_MS = 10_000; // 10 secondes par requête

/**
 * Valeurs par défaut GARANTIES
 * Utilisées au démarrage ET en cas d'erreur
 */
const DEFAULT_DATA: DashboardData = {
  complaints: [],
  recruitments: [],
  sanctions: [],
  pendingAbsences: [],
  membersCount: 0,
  membersSource: null,
  membersError: null,
};

// ============================================================================
// UTILITIES
// ============================================================================

function isDev() {
  return process.env.NODE_ENV !== "production";
}

function makeRequestId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

/**
 * Normalise une réponse API en tableau
 * Gère: array direct, {items: []}, {data: []}
 */
function toArray<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

/**
 * Fetch avec vrai timeout (aborte après N millisecondes)
 */
async function fetchWithTimeout<T>(
  url: string,
  controller: AbortController,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  const timeoutId = setTimeout(() => {
    // Déclencher le timeout en appelant abort() sur le controller
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "content-type": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${txt ? ` — ${txt.slice(0, 100)}` : ""}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}


// ============================================================================
// HOOK
// ============================================================================

export function useDashboardData() {
  /**
   * IMPORTANT: data est TOUJOURS défini avec des valeurs par défaut
   */
  const [data, setData] = useState<DashboardData>(DEFAULT_DATA);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Cache par section
  const cacheRef = useRef<{
    complaints?: CacheEntry<Complaint[]>;
    recruitments?: CacheEntry<Recruitment[]>;
    sanctions?: CacheEntry<Sanction[]>;
    pendingAbsences?: CacheEntry<PendingAbsence[]>;
    members?: CacheEntry<{
      count: number;
      source: "lyg" | "db_stale" | null;
      err: string | null;
    }>;
  }>({});

  // In-flight guard + abort
  const inFlightRef = useRef<{
    running: boolean;
    controller: AbortController | null;
  }>({ running: false, controller: null });

  // Strict mode double mount protection
  const didInitRef = useRef(false);

  /**
   * Fonction fetch principale
   * Utilise Promise.allSettled pour ne PAS échouer si une API fail
   */
  const fetchAll = useCallback(async (force = false) => {
    // Empêche 2 fetches simultanés
    if (inFlightRef.current.running) {
      if (isDev()) console.log("[DASHBOARD] fetch ignored (already running)");
      return;
    }

    inFlightRef.current.running = true;
    setLoading(true);
    setError(null);

    // Abort toute requête préédente
    if (inFlightRef.current.controller) {
      try {
        inFlightRef.current.controller.abort();
      } catch (e) {
        // ignore
      }
    }

    const controller = new AbortController();
    inFlightRef.current.controller = controller;

    const requestId = makeRequestId();
    const now = Date.now();

    if (isDev()) {
      console.log("[DASHBOARD FETCH START]", { requestId, force });
    }

    try {
      // ========================================================================
      // HELPER: Vérifier le cache
      // ========================================================================
      const readCache = <T,>(
        entry: CacheEntry<T> | undefined,
        ttlMs: number,
        forceRefresh: boolean = false
      ): T | null => {
        if (forceRefresh) return null;
        if (!entry) return null;
        if (now - entry.at <= ttlMs) {
          if (isDev()) console.log("[DASHBOARD CACHE HIT]");
          return entry.value;
        }
        return null;
      };

      // ========================================================================
      // BUILD PROMISES - Chaque promise gère sa propre erreur
      // ========================================================================

      const complaintsPromise = (async () => {
        const cached = readCache(cacheRef.current.complaints, TTL_DEFAULT_MS, force);
        if (cached !== null) return cached;

        try {
          const json = await fetchWithTimeout<any>(
            "/api/staff/complaints?status=OPEN&pageSize=5&lite=1",
            controller,
            REQUEST_TIMEOUT_MS
          );
          const arr = toArray<Complaint>(json);
          cacheRef.current.complaints = { at: Date.now(), value: arr };
          return arr;
        } catch (e) {
          if (isDev())
            console.error("[DASHBOARD] complaints fetch failed:", String(e));
          return [];
        }
      })();

      const recruitmentsPromise = (async () => {
        const cached = readCache(cacheRef.current.recruitments, TTL_DEFAULT_MS, force);
        if (cached !== null) return cached;

        try {
          const json = await fetchWithTimeout<any>(
            "/api/staff/list/recruitments?status=OPEN&limit=5",
            controller,
            REQUEST_TIMEOUT_MS
          );
          const arr = toArray<Recruitment>(json);
          cacheRef.current.recruitments = { at: Date.now(), value: arr };
          return arr;
        } catch (e) {
          if (isDev())
            console.error("[DASHBOARD] recruitments fetch failed:", String(e));
          return [];
        }
      })();

      const sanctionsPromise = (async () => {
        const cached = readCache(cacheRef.current.sanctions, TTL_DEFAULT_MS, force);
        if (cached !== null) return cached;

        try {
          const json = await fetchWithTimeout<any>(
            "/api/staff/sanctions?status=ACTIVE&pageSize=5",
            controller,
            REQUEST_TIMEOUT_MS
          );
          const arr = toArray<Sanction>(json);
          cacheRef.current.sanctions = { at: Date.now(), value: arr };
          return arr;
        } catch (e) {
          if (isDev())
            console.error("[DASHBOARD] sanctions fetch failed:", String(e));
          return [];
        }
      })();

      const pendingAbsencesPromise = (async () => {
        const cached = readCache(cacheRef.current.pendingAbsences, TTL_DEFAULT_MS, force);
        if (cached !== null) return cached;

        try {
          const json = await fetchWithTimeout<any>(
            "/api/staff/absences?status=PENDING&pageSize=10&familyId=esperados",
            controller,
            REQUEST_TIMEOUT_MS
          );
          const arr = toArray<PendingAbsence>(json);
          cacheRef.current.pendingAbsences = { at: Date.now(), value: arr };
          return arr;
        } catch (e) {
          if (isDev())
            console.error("[DASHBOARD] pendingAbsences fetch failed:", String(e));
          return [];
        }
      })();

      const membersPromise = (async () => {
        const cached = readCache(cacheRef.current.members, TTL_MEMBERS_MS, force);
        if (cached !== null) return cached;

        try {
          const resp = await fetchWithTimeout<MembersCountResp>(
            "/api/staff/members?countOnly=1&familyId=esperados&limit=1",
            controller,
            REQUEST_TIMEOUT_MS
          );

          const packed = {
            count: resp?.ok ? Number(resp.count ?? 0) : 0,
            source: (resp?.source as "lyg" | "db_stale" | null) ?? null,
            err: null as string | null,
          };

          cacheRef.current.members = { at: Date.now(), value: packed };
          return packed;
        } catch (e) {
          if (isDev())
            console.error("[DASHBOARD] members fetch failed:", String(e));

          // Retourner défaut, jamais undefined
          return {
            count: 0,
            source: null,
            err: String(e),
          };
        }
      })();

      // ========================================================================
      // EXECUTE EN PARALLÈLE avec Promise.allSettled (non fail-fast)
      // ========================================================================

      const results = await Promise.allSettled([
        complaintsPromise,
        recruitmentsPromise,
        sanctionsPromise,
        pendingAbsencesPromise,
        membersPromise,
      ]);

      // Vérifier si on a été aborté
      if (controller.signal.aborted) {
        if (isDev()) console.log("[DASHBOARD] fetch was aborted");
        return;
      }

      const [complaintsResult, recruitmentsResult, sanctionsResult, pendingAbsencesResult, membersResult] =
        results;

      // ========================================================================
      // EXTRACT DES RÉSULTATS - Toujours des valeurs valides
      // ========================================================================

      const complaints =
        complaintsResult.status === "fulfilled"
          ? complaintsResult.value ?? []
          : [];

      const recruitments =
        recruitmentsResult.status === "fulfilled"
          ? recruitmentsResult.value ?? []
          : [];

      const sanctions =
        sanctionsResult.status === "fulfilled"
          ? sanctionsResult.value ?? []
          : [];

      const pendingAbsences =
        pendingAbsencesResult.status === "fulfilled"
          ? pendingAbsencesResult.value ?? []
          : [];

      const membersData =
        membersResult.status === "fulfilled"
          ? membersResult.value ?? {
              count: 0,
              source: null,
              err: null,
            }
          : {
              count: 0,
              source: null,
              err: "Promise rejected",
            };

      // ========================================================================
      // BUILD NEXT STATE - GARANTIE: aucune propriété n'est undefined
      // ========================================================================

      const nextData: DashboardData = {
        complaints: Array.isArray(complaints) ? complaints : [],
        recruitments: Array.isArray(recruitments) ? recruitments : [],
        sanctions: Array.isArray(sanctions) ? sanctions : [],
        pendingAbsences: Array.isArray(pendingAbsences) ? pendingAbsences : [],
        membersCount: Number(membersData?.count ?? 0),
        membersSource: membersData?.source ?? null,
        membersError: membersData?.err ?? null,
      };

      // Log de débogage pour vérifier les types
      if (isDev()) {
        console.log("[DASHBOARD DBG] types after normalization", {
          complaintsIsArray: Array.isArray(nextData.complaints),
          recruitmentsIsArray: Array.isArray(nextData.recruitments),
          sanctionsIsArray: Array.isArray(nextData.sanctions),
          complaintsLength: nextData.complaints.length,
          recruitmentsLength: nextData.recruitments.length,
          sanctionsLength: nextData.sanctions.length,
          membersCount: nextData.membersCount,
          membersCountType: typeof nextData.membersCount,
          membersSource: nextData.membersSource,
          membersError: nextData.membersError,
        });
        
        // Log supplémentaire: vérifier les types bruts AVANT normalisation
        console.log("[DASHBOARD DBG] raw types before normalization", {
          complaintsType: typeof complaints,
          recruitmentsType: typeof recruitments,
          sanctionsType: typeof sanctions,
          raw_complaints_sample: Array.isArray(complaints) ? `Array(${complaints.length})` : complaints ? Object.keys(complaints) : null,
        });
      }

      // Utiliser setData avec prev pour garantir la sécurité
      setData((prev) => ({
        ...prev,
        complaints: nextData.complaints,
        recruitments: nextData.recruitments,
        sanctions: nextData.sanctions,
        pendingAbsences: nextData.pendingAbsences,
        membersCount: nextData.membersCount,
        membersSource: nextData.membersSource,
        membersError: nextData.membersError,
      }));
      setError(null);

      if (isDev()) {
        console.log("[DASHBOARD FETCH END]", {
          requestId,
          complaints: nextData.complaints.length,
          recruitments: nextData.recruitments.length,
          sanctions: nextData.sanctions.length,
          membersCount: nextData.membersCount,
        });
      }
    } catch (e: any) {
      if (!controller.signal.aborted) {
        const errMsg = String(e?.message ?? e ?? "Erreur inconnue");
        setError(errMsg);
        console.error("[DASHBOARD FETCH ERROR]", errMsg);

        /**
         * IMPORTANT: En cas d'erreur globale, TOUJOURS mettre les données par défaut
         * pour éviter un crash "Cannot destructure undefined"
         */
        setData((prev) => ({
          ...prev,
          complaints: [],
          recruitments: [],
          sanctions: [],
          membersCount: 0,
          membersSource: null,
          membersError: null,
        }));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
      inFlightRef.current.running = false;
      inFlightRef.current.controller = null;
    }
  }, []);

  /**
   * Fetch UNE SEULE FOIS au montage
   */
  useEffect(() => {
    // Éviter double-mount en mode Strict Mode
    if (didInitRef.current) {
      return;
    }
    didInitRef.current = true;

    if (isDev()) console.log("[DASHBOARD] component mounted");

    // Initial fetch - pas de force, utilise le cache
    fetchAll(false);

    // Cleanup à l'unmount
    return () => {
      if (isDev()) console.log("[DASHBOARD] component unmounting");
      const controller = inFlightRef.current.controller;
      if (controller) {
        try {
          controller.abort();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []); // Empty deps - run once at mount only

  /**
   * Manual refresh - déclenché par le bouton
   */
  const refresh = useCallback((force = true) => {
    if (isDev()) console.log("[DASHBOARD] manual refresh", { force });
    return fetchAll(force);
  }, [fetchAll]);

  /**
   * Return value stable via useMemo
   */
  return useMemo(
    () => ({
      data,
      loading,
      error,
      refresh,
    }),
    [data, loading, error, refresh]
  );
}
