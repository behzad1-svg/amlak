import { describe, expect, it } from "vitest";
import { normalizePropertyCode } from "./propertyCode";

describe("normalizePropertyCode", () => {
  it("converts Persian and Arabic digits to Latin", () => {
    expect(normalizePropertyCode("f-۰۰۱۲")).toBe("F-0012");
    expect(normalizePropertyCode("f-٠١٢")).toBe("F-012");
  });

  it("trims, uppercases and removes whitespace", () => {
    expect(normalizePropertyCode("  f - 123 ")).toBe("F-123");
  });
});
