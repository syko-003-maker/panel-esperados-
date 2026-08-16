import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Tests de non-régression pour deux bugs fonctionnels constatés en production
 * les 14 et 15/08/2026.
 *
 * Les deux correctifs vivent dans du code fortement couplé à Prisma
 * (`bank-debts-smart`) ou à discord.js (`bot-clapback`), qu'on ne peut pas
 * importer ici — la config Vitest exclut délibérément ces dépendances. On
 * verrouille donc les invariants sur la source, ce qui suffit à détecter une
 * suppression accidentelle du garde-fou.
 */

const SMART = readFileSync("src/lib/bank-debts-smart.ts", "utf8");
const CLAPBACK = readFileSync("discord-worker/src/features/fun/bot-clapback.ts", "utf8");

describe("BUG 1 — rappels de dette suspendus pendant une absence", () => {
  it("interroge la table Absence", () => {
    // Avant le correctif : 0 occurrence du mot 'absence' dans tout le fichier.
    expect(SMART).toMatch(/prisma\.absence\.findMany/);
  });

  it("ne retient que les absences APPROVED couvrant le jour même", () => {
    const block = SMART.slice(SMART.indexOf("absentMemberIds"));
    expect(block).toMatch(/status:\s*"APPROVED"/);
    expect(block).toMatch(/startAt:\s*\{\s*lte:\s*now\s*\}/);
    expect(block).toMatch(/endAt:\s*\{\s*gte:\s*now\s*\}/);
  });

  it("exclut le membre absent depuis isEligible", () => {
    // Le placement compte : `isEligible` est évalué AVANT `count = reminderCount + 1`,
    // donc exclure ici suspend l'envoi ET l'incrément du compteur.
    const elig = SMART.slice(SMART.indexOf("const isEligible"), SMART.indexOf("const result"));
    expect(elig).toMatch(/absentMemberIds\.has\(memberId\)/);
    expect(elig).toMatch(/return false/);
  });

  it("le compteur reste incrémenté après les gardes, jamais avant", () => {
    const idxEligible = SMART.indexOf("if (!isEligible(d.memberId))");
    const idxCount = SMART.indexOf("const count = (state?.reminderCount ?? 0) + 1");
    expect(idxEligible).toBeGreaterThan(0);
    expect(idxCount).toBeGreaterThan(idxEligible);
  });

  it("charge les absences en une seule requête groupée", () => {
    // Une requête par débiteur coûterait un aller-retour par membre à chaque
    // cycle, et le cron tourne ~100 fois par jour.
    expect(SMART).toMatch(/memberId:\s*\{\s*in:\s*debtorMemberIds\s*\}/);
    expect((SMART.match(/prisma\.absence\.findMany/g) ?? []).length).toBe(1);
  });
});

describe("BUG 2 — contexte de l'IA et garde-fous de persona", () => {
  it("lit le titre et la description de l'embed référencé", () => {
    expect(CLAPBACK).toMatch(/function referencedText/);
    const fn = CLAPBACK.slice(CLAPBACK.indexOf("function referencedText"));
    expect(fn).toMatch(/ref\.embeds/);
    expect(fn).toMatch(/embed\.title/);
    expect(fn).toMatch(/embed\.description/);
  });

  it("ne bascule sur l'embed que si le texte brut est trop maigre", () => {
    const fn = CLAPBACK.slice(CLAPBACK.indexOf("function referencedText"));
    expect(fn).toMatch(/THIN_CONTENT_CHARS/);
    expect(fn).toMatch(/plain\.length >= THIN_CONTENT_CHARS/);
  });

  it("nettoie le markdown et tronque", () => {
    const fn = CLAPBACK.slice(CLAPBACK.indexOf("function referencedText"));
    expect(fn).toMatch(/replace\(/);
    expect(fn).toMatch(/REFERENCED_TEXT_MAX/);
  });

  it("le contexte du message référencé passe par ce helper", () => {
    expect(CLAPBACK).toMatch(/text:\s*referencedText\(ref\)/);
    // L'ancienne extraction, aveugle aux embeds, ne doit plus exister.
    expect(CLAPBACK).not.toMatch(/text:\s*\(ref\.cleanContent \?\? ""\)\.slice/);
  });

  it("interdit de nier catégoriquement une phrase absente du contexte", () => {
    expect(CLAPBACK).toMatch(/P_HONNETETE/);
    expect(CLAPBACK).toMatch(/ne la nie JAMAIS categoriquement/);
    expect(CLAPBACK).toMatch(/je n'ai jamais dit ca/);
  });

  it("interdit toute action ou interprétation disciplinaire", () => {
    expect(CLAPBACK).toMatch(/P_DECISION/);
    const bloc = CLAPBACK.slice(CLAPBACK.indexOf("const P_DECISION"));
    expect(bloc).toMatch(/ni demote, ni kick, ni blacklist, ni warn/);
    expect(bloc).toMatch(/ne vaut PAS ordre/);
  });

  it("demande le contexte face à un message très court", () => {
    expect(CLAPBACK).toMatch(/P_MESSAGE_COURT/);
    expect(CLAPBACK).toMatch(/n'invente aucune interpretation/);
  });

  it("les trois garde-fous sont TOUJOURS dans la persona, clash compris", () => {
    // En mode clash le ton monte : c'est précisément là que l'aplomb sur un
    // contexte absent fait des dégâts. Ils ne doivent pas être conditionnels.
    const build = CLAPBACK.slice(
      CLAPBACK.indexOf("function buildPersona"),
      CLAPBACK.indexOf("// Message NEUTRE")
    );
    expect(build).toMatch(/parts\.push\(P_HONNETETE, P_DECISION, P_MESSAGE_COURT\)/);
    expect(build).not.toMatch(/if \(opts\.hostile\)[\s\S]*P_HONNETETE/);
  });
});

const SYNC_MEMBERS = readFileSync("src/lib/lyg/sync-members.ts", "utf8");
const MEMBERS_CRON = readFileSync("discord-worker/src/members-auto-sync.ts", "utf8");
const INFOS_CRON = readFileSync("discord-worker/src/infos-auto-sync.ts", "utf8");

describe("#8-A — resync Discord découplé du chemin critique", () => {
  it("le resync n'est plus attendu par le sync des membres", () => {
    // Il l'était : un resync > 30 s faisait expirer l'appel du worker et
    // transformait un sync RÉUSSI en `exception`, 14 fois par 24 h.
    expect(SYNC_MEMBERS).not.toMatch(/await discordSnapshotSyncInFlight/);
    expect(SYNC_MEMBERS).toMatch(/void discordSnapshotSyncInFlight/);
  });

  it("le verrou anti-concurrence est préservé", () => {
    // Sans lui, découpler autoriserait plusieurs resyncs simultanés.
    expect(SYNC_MEMBERS).toMatch(/if \(discordSnapshotSyncInFlight\) return;/);
    expect(SYNC_MEMBERS).toMatch(/discordSnapshotSyncInFlight = null;/);
  });

  it("l'échec du resync reste capté sur place et ne remonte pas", () => {
    const fn = SYNC_MEMBERS.slice(SYNC_MEMBERS.indexOf("async function maybeRunDiscordSnapshotResync"));
    expect(fn).toMatch(/catch \(error\)/);
    expect(fn).toMatch(/lyg_members_trigger_discord_snapshot_resync_failed/);
    expect(fn).toMatch(/finally/);
  });

  it("la fréquence et la logique métier sont inchangées", () => {
    expect(SYNC_MEMBERS).toMatch(/DISCORD_SNAPSHOT_SYNC_INTERVAL_MS = 60 \* 60 \* 1000/);
    expect(SYNC_MEMBERS).toMatch(/staleMembersCount === 0/);
  });

  it("le résultat du resync garde ses propres événements, distincts du cycle", () => {
    expect(SYNC_MEMBERS).toMatch(/lyg_members_trigger_discord_snapshot_resync_done/);
  });
});

describe("#8-B — logs SYNC/SKIP alignés", () => {
  it("members et infos utilisent readSyncOutcome", () => {
    for (const src of [MEMBERS_CRON, INFOS_CRON]) {
      expect(src).toMatch(/readSyncOutcome/);
      expect(src).toMatch(/skippedBecause/);
    }
  });

  it("le log 'ok' indifférencié a disparu", () => {
    expect(MEMBERS_CRON).not.toMatch(/console\.log\("\[MEMBERS_AUTO_SYNC\] ok"/);
    expect(INFOS_CRON).not.toMatch(/console\.log\("\[INFOS_AUTO_SYNC\] ok"/);
  });
});
