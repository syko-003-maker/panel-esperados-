import { describe, it, expect } from "vitest";
import { describeDatabaseUrl } from "@/lib/db-url";

/**
 * Le log de démarrage de `auth.ts` exposait le mot de passe PostgreSQL en clair
 * dans son champ `database` : la regex maison partait du premier `/`, celui de
 * `postgresql://`, et emportait les identifiants avec elle.
 *
 * Constaté le 15/08/2026 dans la sortie de `npm run test:run`. Le garde
 * `NODE_ENV !== "production"` a empêché toute fuite côté serveur — 0 occurrence
 * dans `journalctl` sur 30 jours — mais le mot de passe de production partait
 * dans le terminal à chaque exécution des tests.
 *
 * Ces tests verrouillent l'invariant : AUCUN champ renvoyé ne contient le
 * secret, quelle que soit la forme de l'URL.
 */

const PASSWORD = "S3cr3tDeProduction";

describe("describeDatabaseUrl — URL PostgreSQL complète", () => {
  const URL_COMPLETE = `postgresql://panel_user:${PASSWORD}@127.0.0.1:5434/panel_db`;

  it("ne renvoie que le nom de la base dans `database`", () => {
    // Le cœur du correctif : avant, ce champ valait
    // `/panel_user:<motdepasse>@127.0.0.1:5434/panel_db`.
    expect(describeDatabaseUrl(URL_COMPLETE).database).toBe("panel_db");
  });

  it("renvoie l'hôte et le port, sans identifiants", () => {
    expect(describeDatabaseUrl(URL_COMPLETE).host).toBe("127.0.0.1:5434");
  });

  it("masque le mot de passe dans `url`", () => {
    const { url } = describeDatabaseUrl(URL_COMPLETE);
    expect(url).toContain(":***@");
    expect(url).toContain("panel_user");
  });

  it("aucun champ ne contient le mot de passe", () => {
    const described = describeDatabaseUrl(URL_COMPLETE);
    for (const value of Object.values(described)) {
      expect(value).not.toContain(PASSWORD);
    }
  });
});

describe("describeDatabaseUrl — paramètres de connexion", () => {
  it("ignore `?schema=` pour le nom de la base", () => {
    const d = describeDatabaseUrl(
      `postgresql://panel_user:${PASSWORD}@127.0.0.1:5434/panel_db?schema=public`
    );
    expect(d.database).toBe("panel_db");
    expect(d.database).not.toContain("?");
    expect(d.database).not.toContain(PASSWORD);
  });

  it("supporte plusieurs paramètres", () => {
    const d = describeDatabaseUrl(
      `postgres://u:${PASSWORD}@db.exemple:5432/ma_base?sslmode=require&connection_limit=5`
    );
    expect(d.database).toBe("ma_base");
    expect(d.host).toBe("db.exemple:5432");
    expect(JSON.stringify(d)).not.toContain(PASSWORD);
  });

  it("conserve les paramètres dans `url`, sans le secret", () => {
    const { url } = describeDatabaseUrl(
      `postgresql://panel_user:${PASSWORD}@127.0.0.1:5434/panel_db?schema=public`
    );
    expect(url).toContain("schema=public");
    expect(url).not.toContain(PASSWORD);
  });
});

describe("describeDatabaseUrl — formes limites", () => {
  it("un mot de passe contenant `@` ne décale pas l'hôte", () => {
    // L'ancienne regex `@([^/]+)` s'arrêtait au PREMIER `@` et rendait
    // `ss@127.0.0.1:5434` comme hôte. Un `@` dans un mot de passe est légal.
    const tordu = "p@ssw0rd@vec";
    const d = describeDatabaseUrl(`postgresql://panel_user:${tordu}@127.0.0.1:5434/panel_db`);
    expect(d.host).toBe("127.0.0.1:5434");
    expect(d.database).toBe("panel_db");
    expect(JSON.stringify(d)).not.toContain(tordu);
  });

  it("URL sans identifiants", () => {
    const d = describeDatabaseUrl("postgresql://127.0.0.1:5434/panel_db");
    expect(d).toEqual({
      host: "127.0.0.1:5434",
      database: "panel_db",
      url: "postgresql://127.0.0.1:5434/panel_db",
    });
  });

  it("variable absente ou vide", () => {
    for (const empty of [undefined, null, "", "   "]) {
      expect(describeDatabaseUrl(empty)).toEqual({
        host: "unknown",
        database: "unknown",
        url: "",
      });
    }
  });

  it("chaîne illisible : ne ressort JAMAIS telle quelle", () => {
    // Une chaîne que l'analyseur refuse peut porter le secret sans qu'on sache
    // l'isoler. La recracher « pour aider au diagnostic » rouvrirait la fuite.
    const cassee = `panel_user:${PASSWORD}@127.0.0.1:5434/panel_db`;
    const d = describeDatabaseUrl(cassee);
    expect(d.url).toBe("(illisible)");
    expect(JSON.stringify(d)).not.toContain(PASSWORD);
  });

  it("aucune forme d'URL ne laisse fuir le mot de passe", () => {
    const formes = [
      `postgresql://u:${PASSWORD}@h:5432/db`,
      `postgresql://u:${PASSWORD}@h:5432/db?schema=public`,
      `postgres://u:${PASSWORD}@h/db`,
      `postgresql://u:${PASSWORD}@h:5432/`,
      `postgresql://u:${PASSWORD}@h:5432`,
      `n'importe quoi ${PASSWORD}`,
      `://${PASSWORD}`,
    ];
    for (const forme of formes) {
      expect(JSON.stringify(describeDatabaseUrl(forme))).not.toContain(PASSWORD);
    }
  });
});
