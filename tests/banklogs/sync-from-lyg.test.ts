import { describe, it, expect } from "vitest";
import {
  normalizeLygItem,
  extractItemsFromLygResponse,
} from "@/lib/banklogs/sync-from-lyg";

describe("extractItemsFromLygResponse — tolérance aux formats LYG", () => {
  it("array direct", () => {
    expect(extractItemsFromLygResponse([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("{data: []}", () => {
    expect(extractItemsFromLygResponse({ data: ["a"] })).toEqual(["a"]);
  });

  it("{items: []}", () => {
    expect(extractItemsFromLygResponse({ items: ["b"] })).toEqual(["b"]);
  });

  it("{banklogs: []}", () => {
    expect(extractItemsFromLygResponse({ banklogs: ["c"] })).toEqual(["c"]);
  });

  it("priorité : data > items > banklogs", () => {
    expect(
      extractItemsFromLygResponse({
        data: ["data"],
        items: ["items"],
        banklogs: ["banklogs"],
      })
    ).toEqual(["data"]);
  });

  it("rien → []", () => {
    expect(extractItemsFromLygResponse({})).toEqual([]);
    expect(extractItemsFromLygResponse(null)).toEqual([]);
    expect(extractItemsFromLygResponse(undefined)).toEqual([]);
  });
});

describe("normalizeLygItem — accepte les alias LYG variés", () => {
  it("alias 'at' / 'date' / 'createdAt' / 'time'", () => {
    const r1 = normalizeLygItem({ at: "2026-05-06T12:00:00Z", type: 1, money: 100, steamId: "x" }, "fam");
    const r2 = normalizeLygItem({ date: "2026-05-06T12:00:00Z", type: 1, money: 100, steamId: "x" }, "fam");
    const r3 = normalizeLygItem({ createdAt: "2026-05-06T12:00:00Z", type: 1, money: 100, steamId: "x" }, "fam");
    const r4 = normalizeLygItem({ time: "2026-05-06T12:00:00Z", type: 1, money: 100, steamId: "x" }, "fam");
    expect(r1?.at.toISOString()).toBe("2026-05-06T12:00:00.000Z");
    expect(r2?.at.toISOString()).toBe("2026-05-06T12:00:00.000Z");
    expect(r3?.at.toISOString()).toBe("2026-05-06T12:00:00.000Z");
    expect(r4?.at.toISOString()).toBe("2026-05-06T12:00:00.000Z");
  });

  it("alias 'type' / 'kind' / 'actionType'", () => {
    const a = normalizeLygItem({ at: "2026-01-01", type: 1, money: 50, steamId: "x" }, "f");
    const b = normalizeLygItem({ at: "2026-01-01", kind: 2, money: 50, steamId: "x" }, "f");
    const c = normalizeLygItem({ at: "2026-01-01", actionType: 1, money: 50, steamId: "x" }, "f");
    expect(a?.type).toBe(1);
    expect(b?.type).toBe(2);
    expect(c?.type).toBe(1);
  });

  it("alias 'money' / 'amount' / 'value'", () => {
    expect(normalizeLygItem({ at: "2026-01-01", type: 1, amount: 75, steamId: "x" }, "f")?.money).toBe(75);
    expect(normalizeLygItem({ at: "2026-01-01", type: 1, value: 90, steamId: "x" }, "f")?.money).toBe(90);
  });

  it("alias 'steamId' / 'steam' / 'playerSteamId'", () => {
    expect(normalizeLygItem({ at: "2026-01-01", type: 1, money: 1, steam: "76561" }, "f")?.steamId).toBe("76561");
    expect(normalizeLygItem({ at: "2026-01-01", type: 1, money: 1, playerSteamId: "76562" }, "f")?.steamId).toBe("76562");
  });

  it("date invalide → null", () => {
    expect(normalizeLygItem({ at: "not-a-date", type: 1, money: 1, steamId: "x" }, "f")).toBeNull();
  });

  it("champ obligatoire manquant → null", () => {
    expect(normalizeLygItem({ at: "2026-01-01", money: 1, steamId: "x" }, "f")).toBeNull();
    expect(normalizeLygItem({ at: "2026-01-01", type: 1, steamId: "x" }, "f")).toBeNull();
    expect(normalizeLygItem({ type: 1, money: 1, steamId: "x" }, "f")).toBeNull();
  });

  it("steamId vide → null (string)", () => {
    const r = normalizeLygItem({ at: "2026-01-01", type: 1, money: 1, steamId: "" }, "f");
    expect(r?.steamId).toBeNull();
  });

  it("type/money convertis en nombres", () => {
    const r = normalizeLygItem({ at: "2026-01-01", type: "1", money: "150", steamId: "x" }, "f");
    expect(r?.type).toBe(1);
    expect(r?.money).toBe(150);
  });

  it("familyId injecté depuis le param", () => {
    const r = normalizeLygItem({ at: "2026-01-01", type: 1, money: 1, steamId: "x" }, "fam-cuid");
    expect(r?.familyId).toBe("fam-cuid");
  });
});
