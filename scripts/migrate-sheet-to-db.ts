/**
 * Migration Script: Google Sheet → Database
 * 
 * Usage:
 *   npx ts-node scripts/migrate-sheet-to-db.ts
 * 
 * Or with dry-run:
 *   DRY_RUN=true npx ts-node scripts/migrate-sheet-to-db.ts
 * 
 * Environment:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - MIGRATION_CSV_PATH: Path to exported CSV file (optional)
 *   - DRY_RUN: If "true", don't write to DB
 */

import { PrismaClient, GradeChangeSource } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "true";
const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

// Grade normalization
const GRADE_MAP: Record<string, { grade: string; level: number }> = {
  "WL1": { grade: "WL1", level: 1 },
  "WHITELIST 1": { grade: "WL1", level: 1 },
  "WL2": { grade: "WL2", level: 2 },
  "WHITELIST 2": { grade: "WL2", level: 2 },
  "WL3": { grade: "WL3", level: 3 },
  "WHITELIST 3": { grade: "WL3", level: 3 },
  "WL4": { grade: "WL4", level: 4 },
  "WHITELIST 4": { grade: "WL4", level: 4 },
  "OFFICIER": { grade: "OFFICER", level: 5 },
  "OFFICER": { grade: "OFFICER", level: 5 },
  "CAPITAINE": { grade: "CAPTAIN", level: 6 },
  "CAPTAIN": { grade: "CAPTAIN", level: 6 },
  "CHEF": { grade: "CHEF", level: 7 },
};

function normalizeGrade(input: string | null | undefined): { grade: string | null; level: number } {
  if (!input) return { grade: null, level: 0 };
  const normalized = input.trim().toUpperCase();
  return GRADE_MAP[normalized] ?? { grade: null, level: 0 };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

type MemberRow = {
  discordId: string;
  steamId: string | null;
  rpName: string | null;
  age: number | null;
  grade: string | null;
  gradeLevel: number;
  joinedAt: Date | null;
};

function parseRow(headers: string[], values: string[]): MemberRow | null {
  const get = (key: string): string | null => {
    const idx = headers.findIndex(h => h.toLowerCase().includes(key.toLowerCase()));
    if (idx === -1) return null;
    const val = values[idx];
    return val && val.trim() ? val.trim() : null;
  };

  const discordId = get("discord") ?? get("discordid") ?? get("id discord");
  if (!discordId || !/^\d{17,20}$/.test(discordId)) {
    return null; // Invalid Discord ID
  }

  const gradeRaw = get("grade") ?? get("whitelist") ?? get("wl");
  const { grade, level } = normalizeGrade(gradeRaw);

  const ageRaw = get("age") ?? get("âge");
  const age = ageRaw ? parseInt(ageRaw, 10) : null;

  const joinedRaw = get("joined") ?? get("date") ?? get("arrivée");
  let joinedAt: Date | null = null;
  if (joinedRaw) {
    const parsed = new Date(joinedRaw);
    if (!isNaN(parsed.getTime())) {
      joinedAt = parsed;
    }
  }

  return {
    discordId,
    steamId: get("steam") ?? get("steamid") ?? get("steam id") ?? get("steam64"),
    rpName: get("rp") ?? get("rpname") ?? get("nom rp") ?? get("pseudo"),
    age: age && !isNaN(age) ? age : null,
    grade,
    gradeLevel: level,
    joinedAt,
  };
}

async function migrate() {
  console.log("=".repeat(60));
  console.log("MIGRATION: Google Sheet → Database");
  console.log("=".repeat(60));
  console.log(`Family ID: ${FAMILY_ID}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log("");

  // Find CSV file
  const csvPath = process.env.MIGRATION_CSV_PATH 
    ?? path.join(process.cwd(), "data", "members.csv");
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    console.log("");
    console.log("Please export your Google Sheet as CSV and place it at:");
    console.log(`  ${csvPath}`);
    console.log("");
    console.log("Or set MIGRATION_CSV_PATH environment variable.");
    process.exit(1);
  }

  console.log(`📄 Reading CSV: ${csvPath}`);
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());
  
  if (lines.length < 2) {
    console.error("❌ CSV is empty or has no data rows");
    process.exit(1);
  }

  const headers = parseCSVLine(lines[0]);
  console.log(`📋 Headers: ${headers.join(", ")}`);
  console.log(`📊 Data rows: ${lines.length - 1}`);
  console.log("");

  // Parse all rows
  const members: MemberRow[] = [];
  const errors: { line: number; reason: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const member = parseRow(headers, values);
    
    if (member) {
      members.push(member);
    } else {
      errors.push({ line: i + 1, reason: "Invalid or missing Discord ID" });
    }
  }

  console.log(`✅ Valid members: ${members.length}`);
  console.log(`⚠️ Skipped rows: ${errors.length}`);
  
  if (errors.length > 0 && errors.length <= 10) {
    console.log("   Skipped:");
    errors.forEach(e => console.log(`   - Line ${e.line}: ${e.reason}`));
  }
  console.log("");

  if (DRY_RUN) {
    console.log("🔍 DRY RUN - No changes will be made");
    console.log("");
    console.log("Preview (first 5 members):");
    members.slice(0, 5).forEach(m => {
      console.log(`  - ${m.discordId} | ${m.rpName ?? "?"} | ${m.grade ?? "?"}`);
    });
    console.log("");
    console.log("To run the actual migration, remove DRY_RUN=true");
    return;
  }

  // Ensure family exists
  console.log(`📁 Ensuring family "${FAMILY_ID}" exists...`);
  await prisma.family.upsert({
    where: { slug: FAMILY_ID },
    create: { slug: FAMILY_ID, name: "Los Esperados" },
    update: {},
  });

  // Migrate members
  console.log(`📥 Migrating ${members.length} members...`);
  let created = 0;
  let updated = 0;
  let historyCreated = 0;

  for (const m of members) {
    // Check if member exists
    const existing = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: FAMILY_ID, discordId: m.discordId } },
    });

    if (existing) {
      // Update existing member
      const gradeChanged = existing.grade !== m.grade;
      
      await prisma.member.update({
        where: { id: existing.id },
        data: {
          steamId: m.steamId ?? existing.steamId,
          rpName: m.rpName ?? existing.rpName,
          age: m.age ?? existing.age,
          grade: m.grade ?? existing.grade,
          gradeLevel: m.gradeLevel || existing.gradeLevel,
          joinedAt: m.joinedAt ?? existing.joinedAt,
        },
      });

      // Create grade history if grade changed
      if (gradeChanged && m.grade) {
        await prisma.gradeHistory.create({
          data: {
            memberId: existing.id,
            oldGrade: existing.grade,
            oldGradeLevel: existing.gradeLevel,
            newGrade: m.grade,
            newGradeLevel: m.gradeLevel,
            source: GradeChangeSource.MIGRATION,
            notes: "Migration from Google Sheet",
          },
        });
        historyCreated++;
      }

      updated++;
    } else {
      // Create new member
      const member = await prisma.member.create({
        data: {
          familyId: FAMILY_ID,
          discordId: m.discordId,
          steamId: m.steamId,
          rpName: m.rpName,
          age: m.age,
          grade: m.grade,
          gradeLevel: m.gradeLevel,
          joinedAt: m.joinedAt ?? new Date(),
          isActive: true,
        },
      });

      // Create initial grade history
      if (m.grade) {
        await prisma.gradeHistory.create({
          data: {
            memberId: member.id,
            oldGrade: null,
            oldGradeLevel: null,
            newGrade: m.grade,
            newGradeLevel: m.gradeLevel,
            source: GradeChangeSource.MIGRATION,
            notes: "Initial migration from Google Sheet",
          },
        });
        historyCreated++;
      }

      created++;
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("MIGRATION COMPLETE");
  console.log("=".repeat(60));
  console.log(`✅ Created: ${created} members`);
  console.log(`🔄 Updated: ${updated} members`);
  console.log(`📜 Grade history entries: ${historyCreated}`);
  console.log("");
}

migrate()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
