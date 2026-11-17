import { describe, expect, it } from "vitest";
import { persianSearchVariants } from "./search";

describe("persianSearchVariants", () => {
  it("generates ZWNJ variants for short words", () => {
    const v = persianSearchVariants("سهمبندی");
    expect(v).toContain("سهم\u200Cبندی");
    expect(v.length).toBe(7);
  });

  it("caps variants for long words to raw + stripped only", () => {
    // ۱۵ حرف — بدون گونهٔ نیم‌فاصله
    expect(persianSearchVariants("بازاراملاکبوشهر")).toEqual(["بازاراملاکبوشهر"]);
  });

  it("keeps variants at the 8-char boundary and caps at 9", () => {
    const eight = persianSearchVariants("مشتریانم"); // ۸ حرف
    expect(eight.length).toBe(8);
    expect(eight).toContain("مشتری\u200Cانم");
    const nine = persianSearchVariants("مشتریانما"); // ۹ حرف
    expect(nine).toEqual(["مشتریانما"]);
  });

  it("returns [] for empty input", () => {
    expect(persianSearchVariants("   ")).toEqual([]);
  });
});
