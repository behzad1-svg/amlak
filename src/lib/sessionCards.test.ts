import { describe, expect, it } from "vitest";
import { MAX_SESSION_CARD_CO_ADVISORS, normalizeCoAdvisorIds } from "./sessionCards";

describe("normalizeCoAdvisorIds", () => {
  it("dedupes while keeping order", () => {
    expect(normalizeCoAdvisorIds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("drops the card creator", () => {
    expect(normalizeCoAdvisorIds(["a", "creator", "b"], "creator")).toEqual(["a", "b"]);
  });

  it("drops empty and non-string entries", () => {
    expect(normalizeCoAdvisorIds(["a", "", "  ", 7, null, "b"])).toEqual(["a", "b"]);
  });

  it("returns [] for non-array input", () => {
    expect(normalizeCoAdvisorIds(undefined)).toEqual([]);
    expect(normalizeCoAdvisorIds("a")).toEqual([]);
    expect(normalizeCoAdvisorIds(null)).toEqual([]);
  });
});

describe("MAX_SESSION_CARD_CO_ADVISORS", () => {
  it("is 3", () => {
    expect(MAX_SESSION_CARD_CO_ADVISORS).toBe(3);
  });
});
