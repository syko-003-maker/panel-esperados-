import { describe, it, expect } from "vitest";
import { formatBanklogTime } from "@/lib/banklogs-formatter";

describe("formatBanklogTime", () => {
  it("null → '—'", () => {
    expect(formatBanklogTime(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatBanklogTime(undefined)).toBe("—");
  });

  it("string vide → '—'", () => {
    expect(formatBanklogTime("")).toBe("—");
  });

  it("string espaces → '—'", () => {
    expect(formatBanklogTime("   ")).toBe("—");
  });

  it("Date invalide → '—'", () => {
    expect(formatBanklogTime(new Date("invalid"))).toBe("—");
  });

  it("ISO avec timezone Z → format DD/MM/YYYY HH:MM (heure conservée wall-clock)", () => {
    // LYG envoie ces dates déjà alignées sur l'heure de jeu (Bruxelles)
    expect(formatBanklogTime("2026-05-06T14:30:00Z")).toBe("06/05/2026 14:30");
  });

  it("ISO avec offset +02:00 → wall-clock", () => {
    expect(formatBanklogTime("2026-05-06T14:30:00+02:00")).toBe("06/05/2026 14:30");
  });

  it("ISO sans timezone → traité comme heure locale Bruxelles", () => {
    const result = formatBanklogTime("2026-05-06T14:30:00");
    // Format attendu : DD/MM/YYYY HH:MM
    expect(result).toMatch(/^06\/05\/2026 \d{2}:\d{2}$/);
  });

  it("Format local 'YYYY-MM-DD HH:mm:ss' → format propre", () => {
    const result = formatBanklogTime("2026-05-06 14:30:00");
    expect(result).toMatch(/^06\/05\/2026 \d{2}:\d{2}$/);
  });

  it("Format local sans secondes 'YYYY-MM-DD HH:mm' → format propre", () => {
    const result = formatBanklogTime("2026-05-06 14:30");
    expect(result).toMatch(/^06\/05\/2026 \d{2}:\d{2}$/);
  });

  it("Date object → format propre", () => {
    // Date avec timezone Bruxelles : on test juste le format, pas l'heure exacte
    const d = new Date("2026-05-06T14:30:00Z");
    const result = formatBanklogTime(d);
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it("Number (timestamp ms) → format propre", () => {
    const ts = new Date("2026-05-06T14:30:00Z").getTime();
    const result = formatBanklogTime(ts);
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it("String non parseable → renvoyée telle quelle (fallback)", () => {
    expect(formatBanklogTime("definitely-not-a-date")).toBe("definitely-not-a-date");
  });
});
