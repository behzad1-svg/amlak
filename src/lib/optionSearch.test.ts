import { describe, expect, it } from "vitest";
import { filterSearchOptions, normalizeSearchText } from "./optionSearch";

describe("normalizeSearchText", () => {
  it("converts Arabic yeh/kaf to Persian", () => {
    expect(normalizeSearchText("على كريمى")).toBe("علی کریمی");
  });
  it("converts Persian/Arabic digits to Latin", () => {
    expect(normalizeSearchText("۰۹۱۷١٢٣")).toBe("0917123");
  });
  it("lowercases Latin text", () => {
    expect(normalizeSearchText("SAJ")).toBe("saj");
  });
});

describe("filterSearchOptions", () => {
  const opts = [
    { id: "1", label: "علی کریمی", sub: "09171234567" },
    { id: "2", label: "رضا احمدی", sub: "09170000004" },
  ];
  it("finds by Persian label with Arabic-yeh query", () => {
    expect(filterSearchOptions(opts, "على")).toHaveLength(1);
    expect(filterSearchOptions(opts, "على")[0].id).toBe("1");
  });
  it("finds by phone sub with Persian digits", () => {
    expect(filterSearchOptions(opts, "۰۹۱۷۱۲۳۴۵۶۷")).toHaveLength(1);
  });
  it("finds by phone sub with Arabic digits", () => {
    expect(filterSearchOptions(opts, "٠٩١٧١٢٣")).toHaveLength(1);
  });
  it("returns all on empty query", () => {
    expect(filterSearchOptions(opts, "  ")).toHaveLength(2);
  });
  it("returns none when nothing matches", () => {
    expect(filterSearchOptions(opts, "xyz")).toHaveLength(0);
  });
});
