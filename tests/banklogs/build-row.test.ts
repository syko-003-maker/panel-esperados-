import { describe, it, expect } from "vitest";
import {
  buildBanklogRows,
  serializeBanklogRows,
  computeDebugStats,
} from "@/lib/banklogs/build-row";
import type { BanklogRowRaw } from "@/lib/banklogs/query-banklogs";

function makeRaw(overrides: Partial<BanklogRowRaw> = {}): BanklogRowRaw {
  return {
    memberId: "mem-1",
    at: new Date("2026-05-06T14:30:00Z"),
    type: 1,
    money: 1000,
    steamId: "76561198000000000",
    rpName: "John Doe",
    discordId: "111",
    discordDisplayName: null,
    discordUsername: null,
    isActive: true,
    isGhost: false,
    discordInGuild: true,
    missingFromLygSince: null,
    grade: "Veterano",
    rankRoleId: null,
    rankLabel: null,
    discordRoleIds: [],
    ...overrides,
  };
}

describe("buildBanklogRows", () => {
  it("conserve les rows sans member joint (memberId null)", () => {
    const rows = buildBanklogRows([
      makeRaw({ memberId: null, rpName: null }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].rpName).toBeNull();
  });

  it("conserve les rows avec member displayable", () => {
    const rows = buildBanklogRows([makeRaw()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].rpName).toBe("John Doe");
  });

  it("filtre out les rows avec member non-displayable (isActive=false)", () => {
    const rows = buildBanklogRows([
      makeRaw({ isActive: false }),
    ]);
    expect(rows).toHaveLength(0);
  });

  it("filtre out les rows avec member ghost", () => {
    const rows = buildBanklogRows([
      makeRaw({ isGhost: true }),
    ]);
    expect(rows).toHaveLength(0);
  });

  it("propage type, money, steamId, isGhost", () => {
    const r = buildBanklogRows([makeRaw({ type: 2, money: 5000, steamId: "x", isGhost: false })]);
    expect(r[0]).toMatchObject({ type: 2, money: 5000, steamId: "x", isGhost: false });
  });
});

describe("serializeBanklogRows", () => {
  it("convertit at: Date → ISO string + drop isGhost interne", () => {
    const rows = buildBanklogRows([
      makeRaw({ at: new Date("2026-05-06T14:30:00Z") }),
    ]);
    const json = serializeBanklogRows(rows);
    expect(json[0]).toEqual({
      at: "2026-05-06T14:30:00.000Z",
      type: 1,
      money: 1000,
      steamId: "76561198000000000",
      rpName: "John Doe",
    });
    expect(json[0]).not.toHaveProperty("isGhost");
  });

  it("shape JSON figé : exactement 5 keys", () => {
    const rows = buildBanklogRows([makeRaw()]);
    const json = serializeBanklogRows(rows);
    const keys = Object.keys(json[0]).sort();
    expect(keys).toEqual(["at", "money", "rpName", "steamId", "type"]);
  });
});

describe("computeDebugStats", () => {
  it("compte ghost utilisés (isGhost=true sans rpName)", () => {
    const stats = computeDebugStats([
      makeRaw({ isGhost: true, rpName: null }),
      makeRaw({ isGhost: true, rpName: "X" }), // rpName présent → pas comptabilisé
      makeRaw({ isGhost: false, rpName: null }),
    ]);
    expect(stats.ghostUsedCount).toBe(1);
  });

  it("compte unlinked (sans rpName, sans isGhost)", () => {
    const stats = computeDebugStats([
      makeRaw({ memberId: null, rpName: null, isGhost: false }),
      makeRaw({ memberId: null, rpName: null, isGhost: false }),
      makeRaw(), // rpName présent
    ]);
    expect(stats.unlinkedCount).toBe(2);
    expect(stats.unlinkedSamples).toHaveLength(2);
  });

  it("limite samples à 5", () => {
    const many = Array.from({ length: 10 }, () =>
      makeRaw({ memberId: null, rpName: null, isGhost: false })
    );
    const stats = computeDebugStats(many);
    expect(stats.unlinkedCount).toBe(10);
    expect(stats.unlinkedSamples).toHaveLength(5);
  });
});
