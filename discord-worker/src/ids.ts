// ✅ IMPORTANT: Read env dynamically with Proxy
// This delays env reading until first access, allowing dotenv.config() to load first

function getEnv(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (!value && required) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value ?? "";
}

const ROLE_ID_REGEX = /^[0-9]{17,20}$/;
const DEFAULT_ROLE_IDS = {
  CHEF_FAMILLE_ROLE_ID: "1429607761720770623",
  ETAT_MAJOR_ROLE_ID: "1312845999366209683",
  RECRUTEUR_ROLE_ID: "1312845999215214618",
} as const;

function resolveRoleId(label: keyof typeof DEFAULT_ROLE_IDS): string | null {
  const envValue = getEnv(label, false);
  const trimmed = envValue ? envValue.trim() : "";
  if (trimmed && ROLE_ID_REGEX.test(trimmed)) return trimmed;
  if (trimmed) {
    console.warn(`[discord-worker] roleId misconfigured: ${label}`);
  }
  const fallback = DEFAULT_ROLE_IDS[label];
  return ROLE_ID_REGEX.test(fallback) ? fallback : null;
}

function getStaffRoleIdsFromEnv(): string[] {
  // Try DISCORD_STAFF_ROLE_IDS first (comma-separated)
  const staffRolesEnv = getEnv("DISCORD_STAFF_ROLE_IDS", false);
  if (staffRolesEnv) {
    const roleIds = staffRolesEnv
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id && ROLE_ID_REGEX.test(id));
    if (roleIds.length > 0) {
      return roleIds;
    }
  }

  // Fallback to legacy DISCORD_STAFF_ROLE_ID
  const legacyStaffRole = getEnv("DISCORD_STAFF_ROLE_ID", false);
  if (legacyStaffRole && ROLE_ID_REGEX.test(legacyStaffRole)) {
    return [legacyStaffRole];
  }

  // Default to Chef and Etat-Major
  return [DEFAULT_ROLE_IDS.CHEF_FAMILLE_ROLE_ID, DEFAULT_ROLE_IDS.ETAT_MAJOR_ROLE_ID];
}

// Create a Proxy object that reads env dynamically on each access
export const IDS = new Proxy(
  {} as Record<string, any>,
  {
    get(target, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;

      switch (prop) {
        case "CONTACT_CHANNEL_ID":
          return getEnv("CONTACT_CHANNEL_ID");
        case "BOTS_FAMILLE_CHANNEL_ID":
          return getEnv("BOTS_FAMILLE_CHANNEL_ID");
        case "TICKETS_PARENT_CHANNEL_ID":
          return getEnv("TICKETS_PARENT_CHANNEL_ID");
        case "TICKETS_LOGS_CHANNEL_ID":
          return getEnv("TICKETS_LOGS_CHANNEL_ID");
        case "GUILD_ID":
          return getEnv("GUILD_ID");
        case "CHEF_FAMILLE_ROLE_ID":
          return resolveRoleId("CHEF_FAMILLE_ROLE_ID");
        case "ETAT_MAJOR_ROLE_ID":
          return resolveRoleId("ETAT_MAJOR_ROLE_ID");
        case "RECRUTEUR_ROLE_ID":
          return resolveRoleId("RECRUTEUR_ROLE_ID");
        case "STAFF_ROLE_IDS":
          return getStaffRoleIdsFromEnv();
        case "PANEL_BASE_URL":
          return getEnv("PANEL_BASE_URL", false) || getEnv("INGEST_BASE_URL", false) || "http://localhost:3000";
        case "TICKETS_OPEN_LIMIT":
          return parseInt(getEnv("TICKETS_OPEN_LIMIT", false) || "1", 10);
        case "FAMILY_ID":
          return getEnv("FAMILY_ID", false) || "esperados";
        default:
          return undefined;
      }
    },
  }
);

// Event versioning - increment when breaking changes to event format
export const EVENT_VERSION = 1;

export const CUSTOM_ID = {
  PANEL_RECRUIT: "contact:open:recruitment",
  PANEL_RECRUIT_CONTINUE: "contact:open:recruitment:step2",
  PANEL_COMPLAINT: "contact:open:complaint",
  MODAL_RECRUIT: "contact:modal:recruitment",
  MODAL_COMPLAINT: "contact:modal:complaint",
  STAFF_RECRUIT_FINISH_PREFIX: "ticket:recruitment:finish:",
  STAFF_COMPLAINT_CLOSE_PREFIX: "ticket:complaint:close:",
  LINK_OPEN_PANEL: "link:panel:open",
} as const;

export type ComplaintCloseStatus = "TRAITE" | "NON_RESOLUE" | "REFUSE";

export const PANEL_MARKER_FOOTER = "contact-panel:v1";
