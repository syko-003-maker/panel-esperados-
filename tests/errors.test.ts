import { describe, it, expect } from "vitest";
import { getErrorMessage, toError } from "@/lib/errors";

describe("getErrorMessage", () => {
  it("Error → message", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("string → string lui-même", () => {
    expect(getErrorMessage("oops")).toBe("oops");
  });

  it("null → 'Erreur inconnue'", () => {
    expect(getErrorMessage(null)).toBe("Erreur inconnue");
  });

  it("undefined → 'Erreur inconnue'", () => {
    expect(getErrorMessage(undefined)).toBe("Erreur inconnue");
  });

  it("objet avec message string → message", () => {
    expect(getErrorMessage({ message: "axios fail" })).toBe("axios fail");
  });

  it("objet sans message → JSON.stringify", () => {
    expect(getErrorMessage({ code: "EACCES", path: "/x" })).toBe('{"code":"EACCES","path":"/x"}');
  });

  it("objet avec message non-string → fallback JSON", () => {
    const result = getErrorMessage({ message: 42 });
    expect(result).toBe('{"message":42}');
  });

  it("nombre → tente JSON.stringify", () => {
    expect(getErrorMessage(404)).toBe("404");
  });
});

describe("toError", () => {
  it("Error → même Error", () => {
    const e = new Error("x");
    expect(toError(e)).toBe(e);
  });

  it("string → Error avec message", () => {
    const result = toError("oops");
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("oops");
  });

  it("null → Error('Erreur inconnue')", () => {
    expect(toError(null).message).toBe("Erreur inconnue");
  });
});
