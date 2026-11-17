import { describe, expect, it } from "vitest";
import { resolveTheme, THEME_STORAGE_KEY } from "./theme";

describe("resolveTheme", () => {
  it("dark ذخیره شده یعنی تاریک", () => {
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("light ذخیره شده یعنی روشن", () => {
    expect(resolveTheme("light")).toBe("light");
  });

  it("مقدار خالی یا نامشخص یعنی روشن (پیش فرض)", () => {
    expect(resolveTheme(null)).toBe("light");
    expect(resolveTheme(undefined)).toBe("light");
    expect(resolveTheme("")).toBe("light");
    expect(resolveTheme("auto")).toBe("light");
    expect(resolveTheme("DARK")).toBe("light");
  });

  it("کلید ذخیره سازی ثابت است", () => {
    expect(THEME_STORAGE_KEY).toBe("saj-theme");
  });
});
