import { describe, it, expect } from "vitest";
import { joinUrl } from "@/lib/banklogs/lyg-client";

describe("joinUrl — concaténation base + path sans double /api", () => {
  it("base sans /api + path /api/x → base/api/x", () => {
    expect(joinUrl("https://api.lyg.fr", "/api/darkrp/familles/X/banklogs"))
      .toBe("https://api.lyg.fr/api/darkrp/familles/X/banklogs");
  });

  it("base SE TERMINE par /api + path /api/x → pas de double /api", () => {
    expect(joinUrl("https://api.lyg.fr/api", "/api/darkrp/familles/X/banklogs"))
      .toBe("https://api.lyg.fr/api/darkrp/familles/X/banklogs");
  });

  it("base avec trailing slash → strippé", () => {
    expect(joinUrl("https://api.lyg.fr/", "/api/x"))
      .toBe("https://api.lyg.fr/api/x");
    expect(joinUrl("https://api.lyg.fr///", "/api/x"))
      .toBe("https://api.lyg.fr/api/x");
  });

  it("path sans / initial → ajouté", () => {
    expect(joinUrl("https://api.lyg.fr", "api/x"))
      .toBe("https://api.lyg.fr/api/x");
  });

  it("path commence pas par /api → pas de stripping", () => {
    expect(joinUrl("https://api.lyg.fr/api", "/v2/banklogs"))
      .toBe("https://api.lyg.fr/api/v2/banklogs");
  });

  it("conserve query string et fragments dans le path", () => {
    expect(joinUrl("https://api.lyg.fr", "/api/x?page=1"))
      .toBe("https://api.lyg.fr/api/x?page=1");
  });
});
