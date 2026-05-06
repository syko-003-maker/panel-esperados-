import { describe, it, expect } from "vitest";
import {
  parseScope,
  parseSortBy,
  parseSortDir,
  parseLimit,
  sanitizeSearch,
  parseMembersQuery,
  makeCacheKey,
  MAX_SEARCH_LENGTH,
} from "@/lib/staff/members/query-params";

describe("parseScope", () => {
  it("renvoie 'active' par défaut (null, valeur invalide)", () => {
    expect(parseScope(null)).toBe("active");
    expect(parseScope("foo")).toBe("active");
    expect(parseScope("")).toBe("active");
  });

  it("accepte les scopes valides", () => {
    expect(parseScope("all")).toBe("all");
    expect(parseScope("demoted")).toBe("demoted");
    expect(parseScope("non_link")).toBe("non_link");
    expect(parseScope("blacklisted")).toBe("blacklisted");
    expect(parseScope("reservists")).toBe("reservists");
    expect(parseScope("everything")).toBe("everything");
  });
});

describe("parseSortBy", () => {
  it("renvoie 'name' par défaut", () => {
    expect(parseSortBy(null)).toBe("name");
    expect(parseSortBy("foo")).toBe("name");
  });

  it("accepte les sorts valides", () => {
    expect(parseSortBy("grade")).toBe("grade");
    expect(parseSortBy("playtime7d")).toBe("playtime7d");
    expect(parseSortBy("status")).toBe("status");
  });
});

describe("parseSortDir", () => {
  it("renvoie 'asc' par défaut", () => {
    expect(parseSortDir(null)).toBe("asc");
    expect(parseSortDir("foo")).toBe("asc");
    expect(parseSortDir("asc")).toBe("asc");
  });

  it("accepte 'desc'", () => {
    expect(parseSortDir("desc")).toBe("desc");
  });
});

describe("parseLimit", () => {
  it("défaut 200 si absent ou invalide", () => {
    expect(parseLimit(null)).toBe(200);
    expect(parseLimit("")).toBe(200);
    expect(parseLimit("not-a-number")).toBe(200);
    expect(parseLimit("0")).toBe(200);
    expect(parseLimit("-5")).toBe(200);
  });

  it("accepte les nombres valides", () => {
    expect(parseLimit("100")).toBe(100);
    expect(parseLimit("1")).toBe(1);
  });

  it("clamp à 500 max", () => {
    expect(parseLimit("500")).toBe(500);
    expect(parseLimit("1000")).toBe(500);
    expect(parseLimit("99999")).toBe(500);
  });
});

describe("sanitizeSearch", () => {
  it("trim + null safe", () => {
    expect(sanitizeSearch(null)).toBe("");
    expect(sanitizeSearch("  hello  ")).toBe("hello");
  });

  it("clamp à MAX_SEARCH_LENGTH", () => {
    const long = "x".repeat(MAX_SEARCH_LENGTH + 50);
    const result = sanitizeSearch(long);
    expect(result.length).toBe(MAX_SEARCH_LENGTH);
  });
});

describe("parseMembersQuery (intégration)", () => {
  function makeUrl(params: Record<string, string>) {
    const u = new URL("http://localhost/api/staff/members");
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u;
  }

  it("URL vide → defaults", () => {
    const q = parseMembersQuery(makeUrl({}));
    expect(q).toEqual({
      familySlug: "esperados",
      scope: "active",
      countOnly: false,
      search: "",
      sortBy: "name",
      sortDir: "asc",
      limit: 200,
      includeInactive: false, // active → !includeInactive
    });
  });

  it("scope=demoted → includeInactive=true", () => {
    const q = parseMembersQuery(makeUrl({ scope: "demoted" }));
    expect(q.scope).toBe("demoted");
    expect(q.includeInactive).toBe(true);
  });

  it("countOnly=1 → bool true", () => {
    expect(parseMembersQuery(makeUrl({ countOnly: "1" })).countOnly).toBe(true);
    expect(parseMembersQuery(makeUrl({ countOnly: "0" })).countOnly).toBe(false);
    expect(parseMembersQuery(makeUrl({ countOnly: "true" })).countOnly).toBe(false);
  });

  it("search via 'search' OU 'q' (legacy)", () => {
    expect(parseMembersQuery(makeUrl({ search: "Aziz" })).search).toBe("Aziz");
    expect(parseMembersQuery(makeUrl({ q: "Aziz" })).search).toBe("Aziz");
    // search prend priorité sur q
    expect(parseMembersQuery(makeUrl({ search: "A", q: "B" })).search).toBe("A");
  });
});

describe("makeCacheKey", () => {
  it("est déterministe pour les mêmes params", () => {
    const q = parseMembersQuery(new URL("http://localhost/?scope=demoted&sortBy=grade"));
    const k1 = makeCacheKey(q);
    const k2 = makeCacheKey(q);
    expect(k1).toBe(k2);
  });

  it("varie avec scope", () => {
    const u1 = parseMembersQuery(new URL("http://localhost/?scope=active"));
    const u2 = parseMembersQuery(new URL("http://localhost/?scope=demoted"));
    expect(makeCacheKey(u1)).not.toBe(makeCacheKey(u2));
  });

  it("varie avec sortBy", () => {
    const u1 = parseMembersQuery(new URL("http://localhost/?sortBy=name"));
    const u2 = parseMembersQuery(new URL("http://localhost/?sortBy=grade"));
    expect(makeCacheKey(u1)).not.toBe(makeCacheKey(u2));
  });

  it("ignore les params non significatifs (path, fragments)", () => {
    const u1 = parseMembersQuery(new URL("http://localhost/api/x?scope=active"));
    const u2 = parseMembersQuery(new URL("http://localhost/api/y?scope=active"));
    expect(makeCacheKey(u1)).toBe(makeCacheKey(u2));
  });
});
