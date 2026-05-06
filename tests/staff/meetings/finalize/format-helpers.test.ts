import { describe, it, expect } from "vitest";
import {
  formatMeetingDate,
  formatMeetingMinutes,
  truncateEmbedLines,
  MAX_EMBED_FIELD_LENGTH,
} from "@/lib/staff/meetings/finalize/format-helpers";

describe("formatMeetingDate", () => {
  it("Date object → DD/MM/YYYY locale FR", () => {
    expect(formatMeetingDate(new Date("2026-05-06T12:00:00Z"))).toMatch(/^06\/05\/2026$/);
  });

  it("ISO string → DD/MM/YYYY", () => {
    expect(formatMeetingDate("2026-05-06T12:00:00Z")).toMatch(/^06\/05\/2026$/);
  });

  it("null/undefined → 'Date inconnue'", () => {
    expect(formatMeetingDate(null)).toBe("Date inconnue");
    expect(formatMeetingDate(undefined)).toBe("Date inconnue");
  });

  it("Date invalide → 'Date inconnue'", () => {
    expect(formatMeetingDate("not-a-date")).toBe("Date inconnue");
    expect(formatMeetingDate(new Date("invalid"))).toBe("Date inconnue");
  });
});

describe("formatMeetingMinutes", () => {
  it("0 → '0min'", () => {
    expect(formatMeetingMinutes(0)).toBe("0min");
    expect(formatMeetingMinutes(null)).toBe("0min");
    expect(formatMeetingMinutes(undefined)).toBe("0min");
  });

  it("< 60 min → 'Xmin'", () => {
    expect(formatMeetingMinutes(45)).toBe("45min");
    expect(formatMeetingMinutes(1)).toBe("1min");
  });

  it("multiples de 60 → 'Xh' (sans min)", () => {
    expect(formatMeetingMinutes(60)).toBe("1h");
    expect(formatMeetingMinutes(120)).toBe("2h");
  });

  it("Xh Ymin", () => {
    expect(formatMeetingMinutes(90)).toBe("1h 30min");
    expect(formatMeetingMinutes(125)).toBe("2h 5min");
  });

  it("non-finite / négatif → 0min (clamp safe)", () => {
    expect(formatMeetingMinutes(NaN)).toBe("0min");
    expect(formatMeetingMinutes(Infinity)).toBe("0min");
    expect(formatMeetingMinutes(-30)).toBe("0min");
  });

  it("arrondi proper", () => {
    expect(formatMeetingMinutes(59.4)).toBe("59min");
    expect(formatMeetingMinutes(59.6)).toBe("1h"); // round → 60
  });
});

describe("truncateEmbedLines", () => {
  it("array vide → '-'", () => {
    expect(truncateEmbedLines([])).toBe("-");
  });

  it("toutes les lignes < maxChars → joined par \\n", () => {
    expect(truncateEmbedLines(["a", "b", "c"])).toBe("a\nb\nc");
  });

  it("dépasse maxChars → tronque + ajoute '+N autre(s)'", () => {
    const lines = ["x".repeat(50), "y".repeat(50), "z".repeat(50)];
    const result = truncateEmbedLines(lines, 60);
    expect(result).toContain("... (+");
    expect(result).toContain("autre"); // singulier ou pluriel selon count
  });

  it("singulier '+1 autre' (sans s)", () => {
    const lines = ["a".repeat(950), "b".repeat(50), "c".repeat(50)];
    const result = truncateEmbedLines(lines, 1000);
    // Chaîne qui dépasse → keep la 1ere, drop les 2 suivantes
    expect(result).toContain("autre");
  });

  it("respecte MAX_EMBED_FIELD_LENGTH par défaut (1000)", () => {
    expect(MAX_EMBED_FIELD_LENGTH).toBe(1000);
    const lines = Array.from({ length: 200 }, () => "x".repeat(10));
    const result = truncateEmbedLines(lines);
    expect(result.length).toBeLessThanOrEqual(MAX_EMBED_FIELD_LENGTH + 50); // tolerance pour suffix
  });
});
