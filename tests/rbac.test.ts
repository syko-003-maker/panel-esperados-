import { describe, it, expect } from "vitest";
import { hasPermission, hasAnyPermission, hasAllPermissions } from "@/lib/rbac";
import type { StaffUserInfo, PermissionCode } from "@/lib/rbac";

function makeStaff(perms: PermissionCode[]): StaffUserInfo {
  return {
    id: "staff-1",
    familyId: "esperados",
    userId: "user-1",
    discordId: "111",
    roleId: "role-1",
    roleCode: "STAFF",
    roleName: "Staff",
    rolePriority: 5,
    isActive: true,
    permissions: perms,
  };
}

describe("hasPermission", () => {
  it("staff null → false", () => {
    expect(hasPermission(null, "MEMBERS_VIEW")).toBe(false);
  });

  it("permission présente → true", () => {
    const staff = makeStaff(["MEMBERS_VIEW"]);
    expect(hasPermission(staff, "MEMBERS_VIEW")).toBe(true);
  });

  it("permission absente → false", () => {
    const staff = makeStaff(["MEMBERS_VIEW"]);
    expect(hasPermission(staff, "ADMIN_FULL")).toBe(false);
  });

  it("liste de permissions vide → toutes les checks retournent false", () => {
    const staff = makeStaff([]);
    expect(hasPermission(staff, "MEMBERS_VIEW")).toBe(false);
    expect(hasPermission(staff, "ADMIN_FULL")).toBe(false);
  });
});

describe("hasAnyPermission", () => {
  const staff = makeStaff(["MEMBERS_VIEW", "TICKETS_VIEW"]);

  it("staff null → false", () => {
    expect(hasAnyPermission(null, ["MEMBERS_VIEW"])).toBe(false);
  });

  it("au moins une perm matche → true", () => {
    expect(hasAnyPermission(staff, ["MEMBERS_VIEW", "ADMIN_FULL"])).toBe(true);
  });

  it("aucune perm ne matche → false", () => {
    expect(hasAnyPermission(staff, ["ADMIN_FULL", "MEETINGS_FINALIZE"])).toBe(false);
  });

  it("liste de permissions vide → false", () => {
    expect(hasAnyPermission(staff, [])).toBe(false);
  });
});

describe("hasAllPermissions", () => {
  const staff = makeStaff(["MEMBERS_VIEW", "TICKETS_VIEW", "SANCTIONS_VIEW"]);

  it("staff null → false", () => {
    expect(hasAllPermissions(null, ["MEMBERS_VIEW"])).toBe(false);
  });

  it("toutes les perms présentes → true", () => {
    expect(hasAllPermissions(staff, ["MEMBERS_VIEW", "TICKETS_VIEW"])).toBe(true);
  });

  it("une seule perm manquante → false", () => {
    expect(hasAllPermissions(staff, ["MEMBERS_VIEW", "ADMIN_FULL"])).toBe(false);
  });

  it("liste vide → true (vacuous truth)", () => {
    expect(hasAllPermissions(staff, [])).toBe(true);
  });
});
