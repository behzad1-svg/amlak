import { describe, it, expect } from "vitest";
import { isValidCronSecret } from "./cronAuth";

describe("isValidCronSecret", () => {
  it("accepts the exact secret", () => {
    expect(isValidCronSecret("s3cr3t", "s3cr3t")).toBe(true);
  });

  it("rejects a wrong secret, null, and different lengths", () => {
    expect(isValidCronSecret("wrong!", "s3cr3t")).toBe(false);
    expect(isValidCronSecret(null, "s3cr3t")).toBe(false);
    expect(isValidCronSecret("", "s3cr3t")).toBe(false);
    expect(isValidCronSecret("s3cr3t!", "s3cr3t")).toBe(false);
    expect(isValidCronSecret("s3cr3", "s3cr3t")).toBe(false);
  });
});
