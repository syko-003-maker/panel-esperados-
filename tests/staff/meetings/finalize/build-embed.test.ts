import { describe, it, expect } from "vitest";
import { buildMeetingFinalizeEmbed } from "@/lib/staff/meetings/finalize/build-embed";

describe("buildMeetingFinalizeEmbed — shape de l'embed Discord", () => {
  it("structure de base : title, description, color, fields, footer, timestamp", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: "2026-05-06T14:00:00Z",
      meetingLabel: "Réunion S22",
      rows: [],
      notes: null,
      statsSummary: [],
    });

    expect(embed.title).toContain("Réunion Famille");
    expect(embed.title).toContain("06/05/2026");
    expect(embed.description).toBe("Réunion S22");
    expect(embed.color).toBe(0x1d4ed8);
    expect(embed.fields).toHaveLength(4);
    expect(embed.footer?.text).toContain("Membres: 0");
    expect(embed.timestamp).toBeInstanceOf(Date);
  });

  it("4 fields toujours dans l'ordre : Stats, Sanctions, Cas concernés, Notes", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [],
      statsSummary: [],
    });
    expect(embed.fields![0].name).toBe("📊 Statistiques");
    expect(embed.fields![1].name).toBe("⚖️ Sanctions prises");
    expect(embed.fields![2].name).toBe("📌 Cas concernés");
    expect(embed.fields![3].name).toBe("📝 Notes finales");
  });

  it("decision counts : agrégés par label traduit, triés par count desc", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [
        { sanctionType: "DEMOTE", rpNameSnapshot: "A", playtimeMinutes: 60 },
        { sanctionType: "DEMOTE", rpNameSnapshot: "B", playtimeMinutes: 120 },
        { sanctionType: "BLACKLIST", rpNameSnapshot: "C", playtimeMinutes: 0 },
      ],
      statsSummary: [],
    });
    const sanctionsField = embed.fields![1].value;
    expect(sanctionsField).toContain("Démote: 2");
    expect(sanctionsField).toContain("Blacklist: 1");
    // Ordre : Démote (count 2) avant Blacklist (count 1)
    expect(sanctionsField.indexOf("Démote: 2")).toBeLessThan(sanctionsField.indexOf("Blacklist: 1"));
  });

  it("filtre les rows avec décision 'noisy' (label null) — OTHER, AUTRE", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [
        { sanctionType: "OTHER", rpNameSnapshot: "Skipped" },
        { sanctionType: "DEMOTE", rpNameSnapshot: "Real" },
      ],
      statsSummary: [],
    });
    const concerned = embed.fields![2].value;
    expect(concerned).toContain("Real");
    expect(concerned).not.toContain("Skipped");
  });

  it("Stats vides → '-'", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [],
      statsSummary: [],
    });
    expect(embed.fields![0].value).toBe("-");
  });

  it("Sanctions vides → 'Aucune'", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [],
      statsSummary: [],
    });
    expect(embed.fields![1].value).toBe("Aucune");
  });

  it("Cas concernés vides → 'Aucun cas concerné'", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [],
      statsSummary: [],
    });
    expect(embed.fields![2].value).toBe("Aucun cas concerné");
  });

  it("Notes vides → 'Aucune note finale.'", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [],
      statsSummary: [],
    });
    expect(embed.fields![3].value).toBe("Aucune note finale.");
  });

  it("Notes fournies → utilisées", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [],
      notes: "Bonne réunion overall.",
      statsSummary: [],
    });
    expect(embed.fields![3].value).toBe("Bonne réunion overall.");
  });

  it("StatsSummary formaté en 'label: value'", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [],
      statsSummary: [
        { label: "Présents", value: 15 },
        { label: "Absents", value: 3 },
      ],
    });
    expect(embed.fields![0].value).toContain("Présents: 15");
    expect(embed.fields![0].value).toContain("Absents: 3");
  });

  it("footer reflète le nombre total de rows", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [{ sanctionType: "DEMOTE" }, { sanctionType: "OTHER" }],
      statsSummary: [],
    });
    expect(embed.footer?.text).toBe("Réunion Famille • Membres: 2");
  });

  it("memberName par défaut 'Membre inconnu' si rpNameSnapshot null/empty", () => {
    const embed = buildMeetingFinalizeEmbed({
      meetingDate: null,
      meetingLabel: "X",
      rows: [
        { sanctionType: "DEMOTE", rpNameSnapshot: null, playtimeMinutes: 30 },
      ],
      statsSummary: [],
    });
    expect(embed.fields![2].value).toContain("Membre inconnu");
  });
});
