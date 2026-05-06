import { describe, it, expect } from "vitest";
import {
  getMemberScopeFlags,
  isLinkedStaffMember,
  isDisplayableStaffMember,
  isNonLinkedDisplayableStaffMember,
  isActiveMembersScopeMember,
} from "@/lib/staff/member-scope";

// IDs réels utilisés en prod (verrouille le comportement réel)
const BLACKLIST_ROLE_ID = "1338901141873758288";
const RESERVIST_ROLE_ID = "1312845999366209682";
const DEMOTE_ROLE_ID = "1340837563753304075";

// Helper builder pour tester les variantes proprement
function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    discordId: "123456789012345678",
    isActive: true,
    isGhost: false,
    discordInGuild: true,
    missingFromLygSince: null,
    grade: null,
    rankLabel: null,
    rankRoleId: null,
    discordRoleIds: [] as string[],
    ...overrides,
  };
}

describe("getMemberScopeFlags", () => {
  it("membre actif standard avec Discord ID → linked + actif, rien d'autre", () => {
    const flags = getMemberScopeFlags(makeMember());
    expect(flags.hasDiscordId).toBe(true);
    expect(flags.isDemoted).toBe(false);
    expect(flags.isBlacklisted).toBe(false);
    expect(flags.isReservist).toBe(false);
    expect(flags.isOutOfDiscord).toBe(false);
  });

  it("membre avec rôle Discord BLACKLIST → isBlacklisted true", () => {
    const flags = getMemberScopeFlags(makeMember({ discordRoleIds: [BLACKLIST_ROLE_ID] }));
    expect(flags.isBlacklisted).toBe(true);
    expect(flags.isDemoted).toBe(false);
  });

  it("membre avec grade='Blacklist' (texte) → isBlacklisted true (fallback texte)", () => {
    const flags = getMemberScopeFlags(makeMember({ grade: "Blacklist" }));
    expect(flags.isBlacklisted).toBe(true);
  });

  it("membre avec rôle Discord RESERVIST → isReservist true", () => {
    const flags = getMemberScopeFlags(makeMember({ discordRoleIds: [RESERVIST_ROLE_ID] }));
    expect(flags.isReservist).toBe(true);
  });

  it("membre avec rankLabel='Réserviste' → isReservist true (normalize accents)", () => {
    const flags = getMemberScopeFlags(makeMember({ rankLabel: "Réserviste" }));
    expect(flags.isReservist).toBe(true);
  });

  it("membre avec rôle Discord DEMOTE → isDemoted true", () => {
    const flags = getMemberScopeFlags(makeMember({ discordRoleIds: [DEMOTE_ROLE_ID] }));
    expect(flags.isDemoted).toBe(true);
  });

  it("membre actif mais hors guild Discord → isOutOfDiscord + isDemoted (fallback)", () => {
    // Comportement validé en session : `discordInGuild: false` traite le membre comme démote
    // SAUF s'il est déjà blacklisté ou réserviste (priorité aux statuts explicites).
    const flags = getMemberScopeFlags(makeMember({ discordInGuild: false }));
    expect(flags.isOutOfDiscord).toBe(true);
    expect(flags.isDemoted).toBe(true);
    expect(flags.isBlacklisted).toBe(false);
    expect(flags.isReservist).toBe(false);
  });

  it("membre BLACKLIST + hors guild → priorité à blacklist, PAS demote", () => {
    // Régression potentielle : sans la logique de priorité, isOutOfDiscord ferait
    // bouger un blacklisté dans le scope demote.
    const flags = getMemberScopeFlags(makeMember({
      discordInGuild: false,
      grade: "Blacklist",
    }));
    expect(flags.isBlacklisted).toBe(true);
    expect(flags.isDemoted).toBe(false);
    expect(flags.isOutOfDiscord).toBe(true);
  });

  it("membre RESERVIST + hors guild → priorité à reservist, PAS demote", () => {
    const flags = getMemberScopeFlags(makeMember({
      discordInGuild: false,
      rankLabel: "Réserviste",
    }));
    expect(flags.isReservist).toBe(true);
    expect(flags.isDemoted).toBe(false);
    expect(flags.isOutOfDiscord).toBe(true);
  });

  it("membre sans discordId → hasDiscordId false, isOutOfDiscord false", () => {
    const flags = getMemberScopeFlags(makeMember({ discordId: "" }));
    expect(flags.hasDiscordId).toBe(false);
    expect(flags.isOutOfDiscord).toBe(false);
  });

  it("normalisation des rôles : array de strings", () => {
    const flags = getMemberScopeFlags(makeMember({ discordRoleIds: ["1", "2", BLACKLIST_ROLE_ID] }));
    expect(flags.isBlacklisted).toBe(true);
  });

  it("normalisation des rôles : string JSON-encodée tolérée", () => {
    const flags = getMemberScopeFlags(makeMember({ discordRoleIds: JSON.stringify([BLACKLIST_ROLE_ID]) }));
    expect(flags.isBlacklisted).toBe(true);
  });

  it("normalisation des rôles : string CSV tolérée (legacy)", () => {
    const flags = getMemberScopeFlags(makeMember({ discordRoleIds: `1,2,${BLACKLIST_ROLE_ID}` }));
    expect(flags.isBlacklisted).toBe(true);
  });
});

describe("isLinkedStaffMember", () => {
  it("avec discordId → true", () => {
    expect(isLinkedStaffMember(makeMember())).toBe(true);
  });

  it("sans discordId → false", () => {
    expect(isLinkedStaffMember(makeMember({ discordId: "" }))).toBe(false);
  });

  it("discordId espaces uniquement → false", () => {
    expect(isLinkedStaffMember(makeMember({ discordId: "   " }))).toBe(false);
  });
});

describe("isDisplayableStaffMember", () => {
  it("membre actif standard → true", () => {
    expect(isDisplayableStaffMember(makeMember())).toBe(true);
  });

  it("membre inactif → false", () => {
    expect(isDisplayableStaffMember(makeMember({ isActive: false }))).toBe(false);
  });

  it("membre ghost → false", () => {
    expect(isDisplayableStaffMember(makeMember({ isGhost: true }))).toBe(false);
  });

  it("membre missingFromLyg → false", () => {
    expect(isDisplayableStaffMember(makeMember({ missingFromLygSince: new Date() }))).toBe(false);
  });

  it("membre démote → false (n'apparaît pas dans le scope par défaut)", () => {
    expect(isDisplayableStaffMember(makeMember({ discordRoleIds: [DEMOTE_ROLE_ID] }))).toBe(false);
  });

  it("membre blacklist → false", () => {
    expect(isDisplayableStaffMember(makeMember({ grade: "Blacklist" }))).toBe(false);
  });

  it("membre réserviste → false", () => {
    expect(isDisplayableStaffMember(makeMember({ rankLabel: "Reserviste" }))).toBe(false);
  });
});

describe("isActiveMembersScopeMember", () => {
  it("displayable + linked → true", () => {
    expect(isActiveMembersScopeMember(makeMember())).toBe(true);
  });

  it("displayable mais non lié → false (tombe dans non-link scope)", () => {
    expect(isActiveMembersScopeMember(makeMember({ discordId: "" }))).toBe(false);
  });

  it("blacklisté lié → false", () => {
    expect(isActiveMembersScopeMember(makeMember({ grade: "Blacklist" }))).toBe(false);
  });
});

describe("isNonLinkedDisplayableStaffMember", () => {
  it("displayable mais non lié → true", () => {
    expect(isNonLinkedDisplayableStaffMember(makeMember({ discordId: "" }))).toBe(true);
  });

  it("displayable + lié → false", () => {
    expect(isNonLinkedDisplayableStaffMember(makeMember())).toBe(false);
  });

  it("blacklisté non lié → false (n'est pas displayable)", () => {
    expect(isNonLinkedDisplayableStaffMember(
      makeMember({ discordId: "", grade: "Blacklist" })
    )).toBe(false);
  });
});
