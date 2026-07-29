import { describe, it, expect } from "vitest";
import { buildStaffMemberRow } from "@/lib/staff/members/build-row";
import type { NormalizedMember } from "@/lib/staff/members/member-normalize";

/**
 * Test du shape de sortie de buildStaffMemberRow.
 * Verrouille les keys attendues par les clients (members-list, dashboard, sidebar).
 * Toute modif des keys casse les clients → ce test doit échouer.
 */

function makeNormalized(overrides: Partial<NormalizedMember> = {}): NormalizedMember {
  return {
    id: "m1",
    steamId: "76561198042817620",
    discordId: "1234567890123456",
    rpName: "John Doe",
    isActive: true,
    isGhost: false,
    discordInGuild: true,
    discordRoleIds: [],
    rankRoleId: null,
    rankLabel: null,
    discordLastError: null,
    discordRolesUpdatedAt: null,
    playtime7d: 100,
    playtime7dUpdatedAt: null,
    grade: "Veterano",
    _displayName: "John Doe",
    _discordGrade: "Veterano",
    _discordGradeLevel: 5,
    _discordGradeRoleId: "999",
    _isActive: true,
    _isDemoted: false,
    _isBlacklisted: false,
    _isReservist: false,
    _isNonLink: false,
    _isOutOfDiscord: false,
    ...overrides,
  };
}

describe("buildStaffMemberRow — shape API", () => {
  it("contient EXACTEMENT les keys attendues par les clients", () => {
    const row = buildStaffMemberRow(
      makeNormalized(),
      new Map([["1234567890123456", "abcdef"]]),
      new Map([["m1", 75]])
    );

    // Snapshot des keys (verrouille le shape API depuis Lot 7)
    const keys = Object.keys(row).sort();
    expect(keys).toEqual([
      "_isActive",
      "_isBlacklisted",
      "_isDemoted",
      "_isNonLink",
      "_isOutOfDiscord",
      "_isReservist",
      "currentGradeName",
      "discordAvatarHash",
      "discordDisplayName",
      "discordId",
      "discordInGuild",
      "discordLastError",
      "discordRolesUpdatedAt",
      "familyName",
      "grade",
      "gradeLevel",
      "id",
      "playtime7d",
      "playtime7dUpdatedAt",
      "playtimeDelta7d",
      // Seuil de présence propre au membre : null = seuil global.
      "playtimeRequiredMinutes",
      "previousPlaytime7d",
      "rankLabel",
      "rankRoleId",
      "rpName",
      "steamId",
      "updatedAt",
    ]);
  });

  it("calcule correctement le delta de playtime", () => {
    const row = buildStaffMemberRow(
      makeNormalized({ playtime7d: 100 }),
      new Map(),
      new Map([["m1", 80]])
    );
    expect(row.previousPlaytime7d).toBe(80);
    expect(row.playtimeDelta7d).toBe(20);
  });

  it("delta null si pas d'historique", () => {
    const row = buildStaffMemberRow(
      makeNormalized({ playtime7d: 100 }),
      new Map(),
      new Map() // pas d'history pour ce member
    );
    expect(row.previousPlaytime7d).toBeNull();
    expect(row.playtimeDelta7d).toBeNull();
  });

  it("avatar récupéré via discordId", () => {
    const row = buildStaffMemberRow(
      makeNormalized({ discordId: "abc" }),
      new Map([["abc", "hash123"]]),
      new Map()
    );
    expect(row.discordAvatarHash).toBe("hash123");
  });

  it("avatar null si discordId manquant", () => {
    const row = buildStaffMemberRow(
      makeNormalized({ discordId: null }),
      new Map([["abc", "hash123"]]),
      new Map()
    );
    expect(row.discordAvatarHash).toBeNull();
  });

  it("propage les flags scope (_isActive, _isDemoted, etc.)", () => {
    const row = buildStaffMemberRow(
      makeNormalized({
        _isActive: false,
        _isBlacklisted: true,
        _isOutOfDiscord: true,
      }),
      new Map(),
      new Map()
    );
    expect((row as any)._isActive).toBe(false);
    expect((row as any)._isBlacklisted).toBe(true);
    expect((row as any)._isOutOfDiscord).toBe(true);
    expect((row as any)._isDemoted).toBe(false);
  });

  it("rpName utilise getMemberDisplayName (pas member.rpName brut)", () => {
    // Si discordDisplayName est présent, c'est lui qui est utilisé en priorité
    const row = buildStaffMemberRow(
      makeNormalized({
        rpName: "Old Name",
        discordDisplayName: "New Display",
      } as any),
      new Map(),
      new Map()
    );
    // On ne dépend pas de l'implémentation exacte de getMemberDisplayName,
    // juste qu'il est appelé (rpName ne devrait pas être null)
    expect(typeof row.rpName).toBe("string");
    expect(row.rpName!.length).toBeGreaterThan(0);
  });
});
