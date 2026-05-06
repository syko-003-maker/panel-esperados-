import { describe, it, expect } from "vitest";
import {
  getRowStatus,
  matchesSearch,
  compareRows,
  sortRowsStable,
} from "@/lib/staff/members/row-status";
import type { StaffMemberDto } from "@/types/staff";

function makeRow(overrides: Partial<StaffMemberDto> = {}): StaffMemberDto {
  return {
    id: "m1",
    steamId: null,
    discordId: "111",
    rpName: "John Doe",
    familyName: null,
    currentGradeName: "Veterano",
    rankRoleId: null,
    rankLabel: null,
    grade: "Veterano",
    gradeLevel: 5,
    discordAvatarHash: null,
    discordRolesUpdatedAt: null,
    discordLastError: null,
    playtime7d: 100,
    playtime7dUpdatedAt: null,
    updatedAt: new Date().toISOString(),
    previousPlaytime7d: null,
    playtimeDelta7d: null,
    ...overrides,
  } as StaffMemberDto;
}

describe("getRowStatus", () => {
  it("Blacklist → 'blacklisted'", () => {
    expect(getRowStatus(makeRow({ currentGradeName: "Blacklist" }))).toBe("blacklisted");
  });

  it("Demote → 'demoted'", () => {
    expect(getRowStatus(makeRow({ currentGradeName: "Demote" }))).toBe("demoted");
  });

  it("Réserviste → 'reservist'", () => {
    expect(getRowStatus(makeRow({ currentGradeName: "Réserviste" }))).toBe("reservist");
  });

  it("Reservist (sans accent) → 'reservist'", () => {
    expect(getRowStatus(makeRow({ currentGradeName: "Reservist" }))).toBe("reservist");
  });

  it("pas de discordId → 'non_link'", () => {
    expect(getRowStatus(makeRow({ discordId: null, currentGradeName: "Veterano" }))).toBe("non_link");
  });

  it("standard → 'active'", () => {
    expect(getRowStatus(makeRow())).toBe("active");
  });
});

describe("matchesSearch", () => {
  const row = makeRow({
    rpName: "John Doe",
    steamId: "76561198042817620",
    discordId: "1234567890",
  });

  it("search vide → match toujours", () => {
    expect(matchesSearch(row, "")).toBe(true);
  });

  it("match rpName (insensible casse)", () => {
    expect(matchesSearch(row, "john")).toBe(true);
    expect(matchesSearch(row, "DOE")).toBe(true);
    expect(matchesSearch(row, "Doe")).toBe(true);
  });

  it("match steamId partiel", () => {
    expect(matchesSearch(row, "76561198")).toBe(true);
  });

  it("match discordId partiel", () => {
    expect(matchesSearch(row, "1234")).toBe(true);
  });

  it("ne match rien si needle absent", () => {
    expect(matchesSearch(row, "xyz123")).toBe(false);
  });

  it("ignore les champs null/empty", () => {
    const r = makeRow({ rpName: null, steamId: null, discordId: null });
    expect(matchesSearch(r, "anything")).toBe(false);
  });
});

describe("compareRows + sortRowsStable", () => {
  it("tri par playtime ascendant", () => {
    const rows = [
      makeRow({ id: "a", rpName: "A", playtime7d: 100 }),
      makeRow({ id: "b", rpName: "B", playtime7d: 50 }),
      makeRow({ id: "c", rpName: "C", playtime7d: 200 }),
    ];
    const sorted = sortRowsStable(rows, "playtime7d", "asc");
    expect(sorted.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("tri par playtime descendant", () => {
    const rows = [
      makeRow({ id: "a", rpName: "A", playtime7d: 100 }),
      makeRow({ id: "b", rpName: "B", playtime7d: 50 }),
      makeRow({ id: "c", rpName: "C", playtime7d: 200 }),
    ];
    const sorted = sortRowsStable(rows, "playtime7d", "desc");
    expect(sorted.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("tri par status (active < blacklisted < reservist < demoted < non_link)", () => {
    const rows = [
      makeRow({ id: "non_link", rpName: "A", discordId: null }),
      makeRow({ id: "active", rpName: "B" }),
      makeRow({ id: "demoted", rpName: "C", currentGradeName: "Demote" }),
      makeRow({ id: "blacklisted", rpName: "D", currentGradeName: "Blacklist" }),
      makeRow({ id: "reservist", rpName: "E", currentGradeName: "Réserviste" }),
    ];
    const sorted = sortRowsStable(rows, "status", "asc");
    expect(sorted.map((r) => r.id)).toEqual([
      "active",
      "blacklisted",
      "reservist",
      "demoted",
      "non_link",
    ]);
  });

  it("tri par name (défaut FR locale)", () => {
    const rows = [
      makeRow({ id: "1", rpName: "Émile" }),
      makeRow({ id: "2", rpName: "Bob" }),
      makeRow({ id: "3", rpName: "Aziz" }),
    ];
    const sorted = sortRowsStable(rows, "name", "asc");
    expect(sorted.map((r) => r.rpName)).toEqual(["Aziz", "Bob", "Émile"]);
  });

  it("tri stable : équilibre préserve l'ordre d'origine", () => {
    const rows = [
      makeRow({ id: "1", rpName: "A", playtime7d: 100 }),
      makeRow({ id: "2", rpName: "A", playtime7d: 100 }),
      makeRow({ id: "3", rpName: "A", playtime7d: 100 }),
    ];
    const sorted = sortRowsStable(rows, "playtime7d", "asc");
    expect(sorted.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});
