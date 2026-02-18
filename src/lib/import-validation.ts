/**
 * Import Validation Utilities
 * Validates member data before import
 */

import { GRADE_TO_ROLE } from "./roles";

// Discord ID: numeric string, 17-20 characters
const DISCORD_ID_REGEX = /^\d{17,20}$/;

// Steam ID64: numeric string, exactly 17 characters
const STEAM_ID64_REGEX = /^\d{17}$/;

export type ImportRowData = {
  discordId?: string;
  steamId?: string;
  rpName?: string;
  grade?: string;
  joinedAt?: string;
  age?: string | number;
};

export type ValidationError = {
  field: string;
  message: string;
  value?: string;
};

export type ValidatedRow = {
  isValid: boolean;
  errors: ValidationError[];
  data: {
    discordId: string | null;
    steamId: string | null;
    rpName: string | null;
    grade: string | null;
    gradeLevel: number;
    joinedAt: Date | null;
    age: number | null;
  };
};

/**
 * Validate a Discord ID
 */
export function validateDiscordId(value: string | undefined): ValidationError | null {
  if (!value || value.trim() === "") {
    return { field: "discordId", message: "Discord ID requis" };
  }
  const trimmed = value.trim();
  if (!DISCORD_ID_REGEX.test(trimmed)) {
    return {
      field: "discordId",
      message: "Discord ID invalide (doit être 17-20 chiffres)",
      value: trimmed,
    };
  }
  return null;
}

/**
 * Validate a Steam ID (optional but if present must be valid)
 */
export function validateSteamId(value: string | undefined): ValidationError | null {
  if (!value || value.trim() === "") {
    return null; // Steam ID is optional
  }
  const trimmed = value.trim();
  if (!STEAM_ID64_REGEX.test(trimmed)) {
    return {
      field: "steamId",
      message: "Steam ID invalide (doit être 17 chiffres)",
      value: trimmed,
    };
  }
  return null;
}

/**
 * Validate a grade
 */
export function validateGrade(value: string | undefined): ValidationError | null {
  if (!value || value.trim() === "") {
    return null; // Grade is optional, will default
  }
  const trimmed = value.trim().toUpperCase();
  const validGrades = Object.keys(GRADE_TO_ROLE);
  
  if (!validGrades.includes(trimmed) && trimmed !== "UNKNOWN") {
    return {
      field: "grade",
      message: `Grade invalide. Valides: ${validGrades.join(", ")}`,
      value: trimmed,
    };
  }
  return null;
}

/**
 * Get grade level from grade name
 */
export function getGradeLevel(grade: string | null): number {
  if (!grade) return 0;
  const levelMap: Record<string, number> = {
    WL1: 1,
    WL2: 2,
    WL3: 3,
    WL4: 4,
    OFFICER: 5,
    CAPTAIN: 6,
    CHEF: 7,
    UNKNOWN: 0,
  };
  return levelMap[grade.toUpperCase()] ?? 0;
}

/**
 * Parse a date string
 */
export function parseDate(value: string | undefined): Date | null {
  if (!value || value.trim() === "") return null;
  
  const trimmed = value.trim();
  
  // Try various formats
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // Try DD/MM/YYYY format
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = trimmed.match(ddmmyyyy);
  if (match) {
    const [, day, month, year] = match;
    const parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  return null;
}

/**
 * Parse age
 */
export function parseAge(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  
  const num = typeof value === "number" ? value : parseInt(value, 10);
  if (isNaN(num) || num < 0 || num > 150) return null;
  
  return num;
}

/**
 * Validate a complete row of import data
 */
export function validateRow(row: ImportRowData, rowNumber: number): ValidatedRow {
  const errors: ValidationError[] = [];
  
  // Validate Discord ID (required)
  const discordError = validateDiscordId(row.discordId);
  if (discordError) {
    errors.push(discordError);
  }
  
  // Validate Steam ID (optional)
  const steamError = validateSteamId(row.steamId);
  if (steamError) {
    errors.push(steamError);
  }
  
  // Validate Grade
  const gradeError = validateGrade(row.grade);
  if (gradeError) {
    errors.push(gradeError);
  }
  
  const discordId = row.discordId?.trim() || null;
  const steamId = row.steamId?.trim() || null;
  const rpName = row.rpName?.trim() || null;
  const grade = row.grade?.trim().toUpperCase() || null;
  
  return {
    isValid: errors.length === 0,
    errors,
    data: {
      discordId,
      steamId: steamId || null,
      rpName: rpName || null,
      grade: grade || "WL4", // Default to WL4 if no grade
      gradeLevel: getGradeLevel(grade || "WL4"),
      joinedAt: parseDate(row.joinedAt),
      age: parseAge(row.age),
    },
  };
}

/**
 * Parse CSV content to rows
 */
export function parseCSV(content: string): ImportRowData[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  
  const headerLine = lines[0];
  const headers = headerLine.split(/[,;]/).map((h) => h.trim().toLowerCase());
  
  // Map common header names to our fields
  const fieldMap: Record<string, keyof ImportRowData> = {
    discordid: "discordId",
    discord_id: "discordId",
    "discord id": "discordId",
    discord: "discordId",
    steamid: "steamId",
    steam_id: "steamId",
    "steam id": "steamId",
    steam: "steamId",
    steam64: "steamId",
    rpname: "rpName",
    rp_name: "rpName",
    "rp name": "rpName",
    "nom rp": "rpName",
    name: "rpName",
    nom: "rpName",
    grade: "grade",
    rank: "grade",
    rang: "grade",
    joinedat: "joinedAt",
    joined_at: "joinedAt",
    "joined at": "joinedAt",
    "date entrée": "joinedAt",
    "date d'entrée": "joinedAt",
    "date entree": "joinedAt",
    date: "joinedAt",
    age: "age",
  };
  
  const headerIndices: Record<keyof ImportRowData, number> = {} as any;
  headers.forEach((header, index) => {
    const field = fieldMap[header];
    if (field) {
      headerIndices[field] = index;
    }
  });
  
  const rows: ImportRowData[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = line.split(/[,;]/).map((v) => v.trim());
    
    const row: ImportRowData = {};
    
    if (headerIndices.discordId !== undefined) {
      row.discordId = values[headerIndices.discordId];
    }
    if (headerIndices.steamId !== undefined) {
      row.steamId = values[headerIndices.steamId];
    }
    if (headerIndices.rpName !== undefined) {
      row.rpName = values[headerIndices.rpName];
    }
    if (headerIndices.grade !== undefined) {
      row.grade = values[headerIndices.grade];
    }
    if (headerIndices.joinedAt !== undefined) {
      row.joinedAt = values[headerIndices.joinedAt];
    }
    if (headerIndices.age !== undefined) {
      row.age = values[headerIndices.age];
    }
    
    rows.push(row);
  }
  
  return rows;
}

/**
 * Check for duplicate Discord IDs in import data
 */
export function findDuplicates(rows: ImportRowData[]): Map<string, number[]> {
  const seen = new Map<string, number[]>();
  
  rows.forEach((row, index) => {
    const discordId = row.discordId?.trim();
    if (discordId) {
      const existing = seen.get(discordId) || [];
      existing.push(index + 2); // +2 for 1-based row number + header
      seen.set(discordId, existing);
    }
  });
  
  // Filter to only duplicates
  const duplicates = new Map<string, number[]>();
  seen.forEach((indices, id) => {
    if (indices.length > 1) {
      duplicates.set(id, indices);
    }
  });
  
  return duplicates;
}
