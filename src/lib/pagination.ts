/**
 * Pagination Utilities
 * Cursor-based pagination for efficient list queries
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type PaginationParams = {
  cursor: string | null;
  limit: number;
  direction: "forward" | "backward";
};

export type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  total?: number;
};

export type CursorData = {
  id: string;
  createdAt: string;
};

// ─────────────────────────────────────────────────────────────
// Cursor Encoding/Decoding
// ─────────────────────────────────────────────────────────────

/**
 * Encode cursor data to base64 string
 */
export function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

/**
 * Decode base64 cursor to data
 */
export function decodeCursor(cursor: string): CursorData | null {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf-8");
    const data = JSON.parse(json);
    if (typeof data.id === "string" && typeof data.createdAt === "string") {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Parameter Parsing
// ─────────────────────────────────────────────────────────────

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

/**
 * Parse pagination params from URL search params
 */
export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
  const cursor = searchParams.get("cursor") ?? null;
  const limitRaw = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(1, limitRaw), MAX_LIMIT);
  const direction = searchParams.get("direction") === "backward" ? "backward" : "forward";

  return { cursor, limit, direction };
}

/**
 * Parse search and filter params
 */
export function parseSearchParams(searchParams: URLSearchParams) {
  return {
    q: (searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100),
    status: searchParams.get("status") ?? null,
    type: searchParams.get("type") ?? null,
    activeOnly: searchParams.get("activeOnly") === "true",
    familyId: searchParams.get("familyId") ?? "esperados",
  };
}

// ─────────────────────────────────────────────────────────────
// Query Builders
// ─────────────────────────────────────────────────────────────

/**
 * Build cursor-based where clause
 */
export function buildCursorWhere(cursor: string | null | undefined, direction: "forward" | "backward" = "forward") {
  if (!cursor) return {};

  const cursorData = decodeCursor(cursor);
  if (!cursorData) return {};

  const cursorDate = new Date(cursorData.createdAt);

  // For forward pagination: get items OLDER than cursor
  // For backward pagination: get items NEWER than cursor
  if (direction === "forward") {
    return {
      OR: [
        { createdAt: { lt: cursorDate } },
        {
          createdAt: cursorDate,
          id: { lt: cursorData.id },
        },
      ],
    };
  } else {
    return {
      OR: [
        { createdAt: { gt: cursorDate } },
        {
          createdAt: cursorDate,
          id: { gt: cursorData.id },
        },
      ],
    };
  }
}

/**
 * Build search where clause for text search
 */
export function buildSearchWhere(q: string, fields: string[]) {
  if (!q) return {};

  const searchConditions = fields.map((field) => ({
    [field]: { contains: q, mode: "insensitive" as const },
  }));

  return { OR: searchConditions };
}

// ─────────────────────────────────────────────────────────────
// Result Builder
// ─────────────────────────────────────────────────────────────

/**
 * Build paginated result from query results
 */
export function buildPaginatedResult<T extends { id: string; createdAt: Date }>(
  items: T[],
  limit: number,
  total?: number
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const slice = hasMore ? items.slice(0, limit) : items;

  const lastItem = slice[slice.length - 1];
  const firstItem = slice[0];

  return {
    items: slice,
    nextCursor: hasMore && lastItem
      ? encodeCursor({ id: lastItem.id, createdAt: lastItem.createdAt.toISOString() })
      : null,
    prevCursor: firstItem
      ? encodeCursor({ id: firstItem.id, createdAt: firstItem.createdAt.toISOString() })
      : null,
    hasMore,
    total,
  };
}

// ─────────────────────────────────────────────────────────────
// Offset Pagination (for simple cases)
// ─────────────────────────────────────────────────────────────

export type OffsetParams = {
  page: number;
  pageSize: number;
  skip: number;
};

/**
 * Parse offset pagination params
 */
export function parseOffsetParams(searchParams: URLSearchParams): OffsetParams {
  const pageRaw = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSizeRaw = parseInt(searchParams.get("pageSize") ?? String(DEFAULT_LIMIT), 10);
  
  const page = Math.max(1, pageRaw);
  const pageSize = Math.min(Math.max(1, pageSizeRaw), MAX_LIMIT);
  const skip = (page - 1) * pageSize;

  return { page, pageSize, skip };
}

export type OffsetResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

/**
 * Build offset paginated result
 */
export function buildOffsetResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number
): OffsetResult<T> {
  const totalPages = Math.ceil(total / pageSize);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}
