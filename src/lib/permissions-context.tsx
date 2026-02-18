"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type PermissionCode =
  | "TICKETS_VIEW"
  | "TICKETS_CLOSE"
  | "TICKETS_ASSIGN"
  | "SANCTIONS_VIEW"
  | "SANCTIONS_CREATE"
  | "SANCTIONS_CLOSE"
  | "MEETINGS_VIEW"
  | "MEETINGS_EDIT"
  | "MEETINGS_FINALIZE"
  | "MEMBERS_VIEW"
  | "MEMBERS_EDIT"
  | "MEMBERS_IMPORT"
  | "ACTIVITY_VIEW"
  | "ACTIVITY_MANAGE"
  | "ABSENCES_VIEW"
  | "ABSENCES_MANAGE"
  | "DISCORD_CONFIG"
  | "DISCORD_SYNC"
  | "AUDIT_VIEW"
  | "ADMIN_FULL";

type Role = {
  code: string;
  name: string;
  priority: number;
};

type PermissionsState = {
  isLoading: boolean;
  isStaff: boolean;
  isChef: boolean;
  role: Role | null;
  permissions: string[];
  can: (permission: PermissionCode) => boolean;
  canAny: (...permissions: PermissionCode[]) => boolean;
  canAll: (...permissions: PermissionCode[]) => boolean;
  refresh: () => Promise<void>;
};

const defaultState: PermissionsState = {
  isLoading: true,
  isStaff: false,
  isChef: false,
  role: null,
  permissions: [],
  can: () => false,
  canAny: () => false,
  canAll: () => false,
  refresh: async () => {},
};

// ─────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────

const PermissionsContext = createContext<PermissionsState>(defaultState);

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [isChef, setIsChef] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  async function loadPermissions() {
    try {
      const res = await fetch("/api/me/permissions");
      if (!res.ok) {
        setIsStaff(false);
        setPermissions([]);
        return;
      }

      const data = await res.json();
      if (data.ok) {
        setIsStaff(data.isStaff ?? false);
        setIsChef(data.isChef ?? false);
        setRole(data.role ?? null);
        setPermissions(data.permissions ?? []);
      }
    } catch (err) {
      console.error("[PermissionsProvider] Failed to load permissions:", err);
      setIsStaff(false);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPermissions();
  }, []);

  // Helper functions
  const can = (permission: PermissionCode): boolean => {
    return permissions.includes(permission) || permissions.includes("ADMIN_FULL");
  };

  const canAny = (...perms: PermissionCode[]): boolean => {
    if (permissions.includes("ADMIN_FULL")) return true;
    return perms.some((p) => permissions.includes(p));
  };

  const canAll = (...perms: PermissionCode[]): boolean => {
    if (permissions.includes("ADMIN_FULL")) return true;
    return perms.every((p) => permissions.includes(p));
  };

  return (
    <PermissionsContext.Provider
      value={{
        isLoading,
        isStaff,
        isChef,
        role,
        permissions,
        can,
        canAny,
        canAll,
        refresh: loadPermissions,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function usePermissions(): PermissionsState {
  return useContext(PermissionsContext);
}

// ─────────────────────────────────────────────────────────────
// Guard Component
// ─────────────────────────────────────────────────────────────

type CanProps = {
  permission: PermissionCode;
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Render children only if user has permission
 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const { isLoading, can } = usePermissions();

  if (isLoading) return null;
  if (!can(permission)) return <>{fallback}</>;
  return <>{children}</>;
}

type CanAnyProps = {
  permissions: PermissionCode[];
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Render children if user has any of the permissions
 */
export function CanAny({ permissions: perms, children, fallback = null }: CanAnyProps) {
  const { isLoading, canAny } = usePermissions();

  if (isLoading) return null;
  if (!canAny(...perms)) return <>{fallback}</>;
  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────
// Staff Guard Component
// ─────────────────────────────────────────────────────────────

type StaffOnlyProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Render children only if user is staff
 */
export function StaffOnly({ children, fallback = null }: StaffOnlyProps) {
  const { isLoading, isStaff } = usePermissions();

  if (isLoading) return null;
  if (!isStaff) return <>{fallback}</>;
  return <>{children}</>;
}
