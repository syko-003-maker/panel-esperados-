"use client";

import { useState, useCallback, useEffect } from "react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type PaginatedListState<T> = {
  items: T[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  total?: number;
  page?: number;
  totalPages?: number;
};

export type PaginatedListActions = {
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setFilters: (filters: Record<string, string>) => void;
};

export type UsePaginatedListOptions = {
  endpoint: string;
  initialFilters?: Record<string, string>;
  pageSize?: number;
  useCursor?: boolean;
};

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function usePaginatedList<T extends { id: string }>(
  options: UsePaginatedListOptions
): PaginatedListState<T> & PaginatedListActions {
  const { endpoint, initialFilters = {}, pageSize = 25, useCursor = true } = options;

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | undefined>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFiltersState] = useState(initialFilters);

  const buildUrl = useCallback(
    (cursor?: string | null, pageNum?: number) => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));

      if (useCursor) {
        if (cursor) params.set("cursor", cursor);
      } else {
        params.set("pagination", "offset");
        params.set("page", String(pageNum ?? 1));
        params.set("pageSize", String(pageSize));
      }

      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });

      return `${endpoint}?${params.toString()}`;
    },
    [endpoint, pageSize, useCursor, filters]
  );

  const fetchData = useCallback(
    async (cursor?: string | null, pageNum?: number, append = false) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const url = buildUrl(cursor, pageNum);
        const res = await fetch(url);
        const data = await res.json();

        if (!data.ok) {
          throw new Error(data.error ?? "Failed to fetch");
        }

        if (useCursor) {
          if (append) {
            setItems((prev) => [...prev, ...data.items]);
          } else {
            setItems(data.items ?? []);
          }
          setNextCursor(data.nextCursor ?? null);
          setHasMore(!!data.nextCursor);
          if (data.total !== undefined) setTotal(data.total);
        } else {
          if (append) {
            setItems((prev) => [...prev, ...data.items]);
          } else {
            setItems(data.items ?? []);
          }
          setPage(data.page ?? 1);
          setTotalPages(data.totalPages);
          setTotal(data.total);
          setHasMore(data.hasMore ?? false);
        }
      } catch (err: any) {
        setError(err.message ?? "Network error");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [buildUrl, useCursor]
  );

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load more
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    if (useCursor) {
      await fetchData(nextCursor, undefined, true);
    } else {
      await fetchData(null, page + 1, true);
      setPage((p) => p + 1);
    }
  }, [isLoadingMore, hasMore, useCursor, nextCursor, page, fetchData]);

  // Refresh
  const refresh = useCallback(async () => {
    setItems([]);
    setNextCursor(null);
    setPage(1);
    await fetchData();
  }, [fetchData]);

  // Set filters
  const setFilters = useCallback((newFilters: Record<string, string>) => {
    setFiltersState(newFilters);
    setItems([]);
    setNextCursor(null);
    setPage(1);
  }, []);

  return {
    items,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    total,
    page,
    totalPages,
    loadMore,
    refresh,
    setFilters,
  };
}

// ─────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────

export type LoadMoreButtonProps = {
  onClick: () => void;
  isLoading: boolean;
  hasMore: boolean;
  className?: string;
};

export function LoadMoreButton({ onClick, isLoading, hasMore, className = "" }: LoadMoreButtonProps) {
  if (!hasMore) return null;

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={`px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm disabled:opacity-50 ${className}`}
    >
      {isLoading ? "Chargement..." : "Charger plus"}
    </button>
  );
}

export type EmptyStateProps = {
  message?: string;
  className?: string;
};

export function EmptyState({ message = "Aucun résultat", className = "" }: EmptyStateProps) {
  return (
    <div className={`text-center py-12 text-gray-500 ${className}`}>
      <p>{message}</p>
    </div>
  );
}

export type ErrorStateProps = {
  error: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ error, onRetry, className = "" }: ErrorStateProps) {
  return (
    <div className={`text-center py-12 ${className}`}>
      <p className="text-red-600 mb-4">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}

export type LoadingStateProps = {
  message?: string;
  className?: string;
};

export function LoadingState({ message = "Chargement...", className = "" }: LoadingStateProps) {
  return (
    <div className={`text-center py-12 text-gray-500 ${className}`}>
      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mb-2"></div>
      <p>{message}</p>
    </div>
  );
}
