import { describe, it, expect } from "vitest";
import {
  parseBanklogsQuery,
  makeBanklogsCacheParams,
} from "@/lib/banklogs/query-params";

function url(params: Record<string, string> = {}): URL {
  const u = new URL("http://localhost/api/banklogs");
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u;
}

describe("parseBanklogsQuery", () => {
  it("URL vide → defaults", () => {
    expect(parseBanklogsQuery(url())).toEqual({
      page: 1,
      limit: 50,
      type: null,
      steamId: "",
      member: "",
      days: 0,
    });
  });

  it("page invalide → 1", () => {
    expect(parseBanklogsQuery(url({ page: "0" })).page).toBe(1);
    expect(parseBanklogsQuery(url({ page: "-3" })).page).toBe(1);
    expect(parseBanklogsQuery(url({ page: "abc" })).page).toBe(1);
  });

  it("limit clampé à [1, 200]", () => {
    expect(parseBanklogsQuery(url({ limit: "0" })).limit).toBe(1);
    expect(parseBanklogsQuery(url({ limit: "-10" })).limit).toBe(1);
    expect(parseBanklogsQuery(url({ limit: "100" })).limit).toBe(100);
    expect(parseBanklogsQuery(url({ limit: "999" })).limit).toBe(200);
    expect(parseBanklogsQuery(url({ limit: "abc" })).limit).toBe(50);
  });

  it("type accepté seulement si finite", () => {
    expect(parseBanklogsQuery(url({ type: "1" })).type).toBe(1);
    expect(parseBanklogsQuery(url({ type: "2" })).type).toBe(2);
    expect(parseBanklogsQuery(url({ type: "" })).type).toBeNull();
    expect(parseBanklogsQuery(url({ type: "abc" })).type).toBeNull();
  });

  it("steamId / member trimmés", () => {
    const q = parseBanklogsQuery(url({ steamId: "  76561  ", member: "  Aziz  " }));
    expect(q.steamId).toBe("76561");
    expect(q.member).toBe("Aziz");
  });

  it("days > 0 conservé, sinon 0", () => {
    expect(parseBanklogsQuery(url({ days: "7" })).days).toBe(7);
    expect(parseBanklogsQuery(url({ days: "30" })).days).toBe(30);
    expect(parseBanklogsQuery(url({ days: "0" })).days).toBe(0);
    expect(parseBanklogsQuery(url({ days: "-5" })).days).toBe(0);
    expect(parseBanklogsQuery(url({ days: "abc" })).days).toBe(0);
  });
});

describe("makeBanklogsCacheParams", () => {
  it("convertit type number → string, vide → null", () => {
    const q = parseBanklogsQuery(url({ type: "1" }));
    const p = makeBanklogsCacheParams("fam-cuid-123", q);
    expect(p.type).toBe("1");

    const q2 = parseBanklogsQuery(url());
    const p2 = makeBanklogsCacheParams("fam-cuid-123", q2);
    expect(p2.type).toBeNull();
  });

  it("steamId / member empty → null (vs string vide)", () => {
    const q = parseBanklogsQuery(url());
    const p = makeBanklogsCacheParams("fam", q);
    expect(p.steamId).toBeNull();
    expect(p.member).toBeNull();

    const q2 = parseBanklogsQuery(url({ steamId: "76561" }));
    const p2 = makeBanklogsCacheParams("fam", q2);
    expect(p2.steamId).toBe("76561");
  });

  it("days = 0 → null en cache (pas de filtre temporel)", () => {
    const q = parseBanklogsQuery(url({ days: "0" }));
    const p = makeBanklogsCacheParams("fam", q);
    expect(p.days).toBeNull();

    const q2 = parseBanklogsQuery(url({ days: "7" }));
    const p2 = makeBanklogsCacheParams("fam", q2);
    expect(p2.days).toBe(7);
  });

  it("inclut familyDbId pour isoler le cache par famille", () => {
    const q = parseBanklogsQuery(url());
    const p1 = makeBanklogsCacheParams("fam-A", q);
    const p2 = makeBanklogsCacheParams("fam-B", q);
    expect(p1.familyDbId).toBe("fam-A");
    expect(p2.familyDbId).toBe("fam-B");
  });
});
