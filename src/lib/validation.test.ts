import { describe, expect, it } from "vitest";
import {
  budgetStringToBigInt,
  cashboxEntrySchema,
  changePasswordSchema,
  customerCreateSchema,
  customerTransferSchema,
  customerUpdateSchema,
  dealCreateSchema,
  dealShareInputSchema,
  dealUpdateSchema,
  findInvalidQueryParam,
  followUpCreateSchema,
  loginSchema,
  propertyCreateSchema,
  propertyUpdateSchema,
  safeBigInt,
  sessionCardCreateSchema,
  userCreateSchema,
  viewingCreateSchema,
} from "./validation";

describe("findInvalidQueryParam", () => {
  it("returns null when every param is valid or empty", () => {
    expect(findInvalidQueryParam([])).toBeNull();
    expect(findInvalidQueryParam([{ name: "minPrice", value: "1000" }])).toBeNull();
    expect(findInvalidQueryParam([{ name: "minPrice", value: null }])).toBeNull();
    expect(findInvalidQueryParam([{ name: "minPrice", value: "" }])).toBeNull();
  });

  it("returns the first invalid param name", () => {
    expect(findInvalidQueryParam([{ name: "minPrice", value: "abc" }])).toBe("minPrice");
    expect(
      findInvalidQueryParam([
        { name: "minPrice", value: "abc" },
        { name: "maxPrice", value: "xyz" },
      ]),
    ).toBe("minPrice");
    expect(findInvalidQueryParam([{ name: "minPrice", value: "-5" }])).toBe("minPrice");
  });

  it("accepts decimals only when number=true", () => {
    expect(findInvalidQueryParam([{ name: "pct", value: "12.5", number: true }])).toBeNull();
    expect(findInvalidQueryParam([{ name: "pct", value: "12.5" }])).toBe("pct");
    expect(findInvalidQueryParam([{ name: "pct", value: "12.5.3", number: true }])).toBe("pct");
    expect(findInvalidQueryParam([{ name: "pct", value: "12a", number: true }])).toBe("pct");
  });
});

describe("findInvalidQueryParam with bigint", () => {
  it("rejects values above the PostgreSQL bigint max", () => {
    expect(
      findInvalidQueryParam([{ name: "budgetMax", value: "99999999999999999999999", bigint: true }]),
    ).toBe("budgetMax");
    expect(
      findInvalidQueryParam([{ name: "budgetMax", value: "9223372036854775807", bigint: true }]),
    ).toBeNull();
    expect(
      findInvalidQueryParam([{ name: "budgetMax", value: "9223372036854775808", bigint: true }]),
    ).toBe("budgetMax");
  });

  it("still rejects non-digits with bigint", () => {
    expect(findInvalidQueryParam([{ name: "budgetMax", value: "abc", bigint: true }])).toBe("budgetMax");
  });

  it("does not cap plain number params", () => {
    expect(
      findInvalidQueryParam([{ name: "sizeMax", value: "99999999999999999999999", number: true }]),
    ).toBeNull();
  });
});

describe("safeBigInt", () => {
  it("returns null for empty, non-numeric or out-of-range values", () => {
    expect(safeBigInt(null)).toBeNull();
    expect(safeBigInt("")).toBeNull();
    expect(safeBigInt("abc")).toBeNull();
    expect(safeBigInt("99999999999999999999999")).toBeNull();
  });

  it("parses in-range values", () => {
    expect(safeBigInt("0")).toBe(BigInt(0));
    expect(safeBigInt("3000000000")).toBe(BigInt(3000000000));
    expect(safeBigInt("9223372036854775807")).toBe(BigInt("9223372036854775807"));
  });
});

describe("loginSchema", () => {
  it("accepts a phone and a password", () => {
    expect(loginSchema.safeParse({ phone: "09170000001", password: "secret" }).success).toBe(true);
  });

  it("rejects missing or empty fields", () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
    expect(loginSchema.safeParse({ phone: "", password: "secret" }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: "09170000001" }).success).toBe(false);
  });
});

describe("userCreateSchema", () => {
  const valid = { name: "علی", phone: "09170000001", password: "Abcdef123456", role: "AGENT" as const };

  it("accepts a valid user", () => {
    expect(userCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects bad phone numbers", () => {
    expect(userCreateSchema.safeParse({ ...valid, phone: "0917" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...valid, phone: "0917abc0001" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...valid, phone: "0917000000112345" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...valid, phone: "0917000000" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...valid, phone: "091700000011" }).success).toBe(false);
  });

  it("rejects weak passwords", () => {
    expect(userCreateSchema.safeParse({ ...valid, password: "Abc123" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...valid, password: "Abcdefghijkl" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...valid, password: "123456789012" }).success).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(userCreateSchema.safeParse({ ...valid, role: "ADMIN" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("requires a strong new password", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "Abcdef123456" })
        .success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "short" }).success,
    ).toBe(false);
  });
});

describe("customerCreateSchema", () => {
  const valid = { name: "مشتری تست", phone: "09170000001", type: "BUYER" as const };

  it("accepts a minimal customer", () => {
    expect(customerCreateSchema.safeParse(valid).success).toBe(true);
    expect(
      customerCreateSchema.safeParse({ ...valid, stage: "WON", temperature: "HOT" }).success,
    ).toBe(true);
  });

  it("rejects an unknown type and a bad phone", () => {
    expect(customerCreateSchema.safeParse({ ...valid, type: "FOO" }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ ...valid, phone: "123" }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ ...valid, phone: "091700009999" }).success).toBe(false);
  });

  it("rejects out-of-range preferences", () => {
    expect(customerCreateSchema.safeParse({ ...valid, preferredBeds: 21 }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ ...valid, preferredBeds: -1 }).success).toBe(false);
    expect(
      customerCreateSchema.safeParse({ ...valid, tags: Array.from({ length: 11 }, () => "x") })
        .success,
    ).toBe(false);
    expect(customerCreateSchema.safeParse({ ...valid, budgetMin: "12a" }).success).toBe(false);
  });

  it("rejects a zero budget but allows an empty one", () => {
    expect(customerCreateSchema.safeParse({ ...valid, budgetMax: "0" }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ ...valid, budgetMax: "00" }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ ...valid, budgetMaxMonthly: "0" }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ ...valid, budgetMax: "" }).success).toBe(true);
    expect(customerCreateSchema.safeParse({ ...valid, budgetMax: null }).success).toBe(true);
    expect(customerCreateSchema.safeParse({ ...valid, budgetMax: "100" }).success).toBe(true);
  });
});

describe("budgetStringToBigInt", () => {
  it("normalizes zero and empty to null (no budget)", () => {
    expect(budgetStringToBigInt("0")).toBeNull();
    expect(budgetStringToBigInt("")).toBeNull();
    expect(budgetStringToBigInt(null)).toBeNull();
    expect(budgetStringToBigInt(undefined)).toBeNull();
    expect(budgetStringToBigInt("100")).toBe(BigInt(100));
  });
});

describe("customerUpdateSchema", () => {
  it("accepts an empty update and rejects a bad type", () => {
    expect(customerUpdateSchema.safeParse({}).success).toBe(true);
    expect(customerUpdateSchema.safeParse({ type: "FOO" }).success).toBe(false);
  });
});

describe("propertyCreateSchema", () => {
  const valid = {
    title: "آپارتمان تست",
    type: "آپارتمان",
    dealType: "SALE" as const,
    region: "بوشهر",
    ownerId: "owner-1",
  };

  it("accepts a minimal property", () => {
    expect(propertyCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing required fields and bad values", () => {
    expect(propertyCreateSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
    expect(propertyCreateSchema.safeParse({ ...valid, dealType: "FOO" }).success).toBe(false);
    expect(propertyCreateSchema.safeParse({ ...valid, salePriceToman: "12a" }).success).toBe(false);
    expect(propertyCreateSchema.safeParse({ ...valid, builtYear: 1200 }).success).toBe(false);
    expect(propertyCreateSchema.safeParse({ ...valid, builtYear: 1600 }).success).toBe(false);
    expect(propertyCreateSchema.safeParse({ ...valid, unitsPerFloor: 51 }).success).toBe(false);
  });
});

describe("propertyUpdateSchema", () => {
  it("accepts an empty update and an owner change", () => {
    expect(propertyUpdateSchema.safeParse({}).success).toBe(true);
    expect(propertyUpdateSchema.safeParse({ ownerId: "owner-2" }).success).toBe(true);
  });
});

describe("dealCreateSchema", () => {
  it("accepts a minimal deal and a decimal commission percent", () => {
    expect(dealCreateSchema.safeParse({ customerId: "c1", propertyId: "p1" }).success).toBe(true);
    expect(
      dealCreateSchema.safeParse({ customerId: "c1", propertyId: "p1", commissionPercent: 0.25 })
        .success,
    ).toBe(true);
  });

  it("rejects a commission percent outside 0–100 and a non-numeric commission", () => {
    expect(
      dealCreateSchema.safeParse({ customerId: "c1", propertyId: "p1", commissionPercent: 101 })
        .success,
    ).toBe(false);
    expect(
      dealCreateSchema.safeParse({ customerId: "c1", propertyId: "p1", commissionPercent: -1 })
        .success,
    ).toBe(false);
    expect(
      dealCreateSchema.safeParse({ customerId: "c1", propertyId: "p1", commissionToman: "12a" })
        .success,
    ).toBe(false);
  });
});

describe("dealShareInputSchema", () => {
  it("accepts a percent share with or without a user", () => {
    expect(dealShareInputSchema.safeParse({ pct: 50 }).success).toBe(true);
    expect(dealShareInputSchema.safeParse({ userId: "u1", pct: 100 }).success).toBe(true);
  });

  it("rejects zero and over-100 percents", () => {
    expect(dealShareInputSchema.safeParse({ pct: 0 }).success).toBe(false);
    expect(dealShareInputSchema.safeParse({ pct: 101 }).success).toBe(false);
  });
});

describe("dealUpdateSchema", () => {
  it("accepts office share and shares together", () => {
    expect(
      dealUpdateSchema.safeParse({
        officePct: 50,
        shares: [{ pct: 25 }, { pct: 25 }],
      }).success,
    ).toBe(true);
  });

  it("rejects an office share outside 0–100 and more than 10 shares", () => {
    expect(dealUpdateSchema.safeParse({ officePct: 101 }).success).toBe(false);
    expect(
      dealUpdateSchema.safeParse({
        shares: Array.from({ length: 11 }, () => ({ pct: 9 })),
      }).success,
    ).toBe(false);
    expect(dealUpdateSchema.safeParse({ discountToman: "abc" }).success).toBe(false);
  });
});

describe("cashboxEntrySchema", () => {
  it("accepts a plain numeric amount", () => {
    expect(
      cashboxEntrySchema.safeParse({ type: "IN", amount: "1000000", title: "دریافت" }).success,
    ).toBe(true);
  });

  it("rejects formatted or empty amounts and unknown types", () => {
    expect(
      cashboxEntrySchema.safeParse({ type: "IN", amount: "1,000", title: "دریافت" }).success,
    ).toBe(false);
    expect(cashboxEntrySchema.safeParse({ type: "IN", amount: "", title: "دریافت" }).success).toBe(
      false,
    );
    expect(
      cashboxEntrySchema.safeParse({ type: "FOO", amount: "1000", title: "دریافت" }).success,
    ).toBe(false);
  });
});

describe("sessionCardCreateSchema", () => {
  it("accepts a minimal session card", () => {
    expect(
      sessionCardCreateSchema.safeParse({ customerId: "c1", scheduledAt: "2026-11-16T10:00" })
        .success,
    ).toBe(true);
    expect(
      sessionCardCreateSchema.safeParse({
        customerId: "c1",
        scheduledAt: "2026-11-16T10:00",
        depositPaid: true,
      }).success,
    ).toBe(true);
  });

  it("rejects a missing date and a non-numeric cash amount", () => {
    expect(sessionCardCreateSchema.safeParse({ customerId: "c1" }).success).toBe(false);
    expect(
      sessionCardCreateSchema.safeParse({
        customerId: "c1",
        scheduledAt: "2026-11-16T10:00",
        cashAmountToman: "12a",
      }).success,
    ).toBe(false);
  });
});

describe("customerTransferSchema", () => {
  it("requires a destination advisor", () => {
    expect(customerTransferSchema.safeParse({ toAgentId: "a1" }).success).toBe(true);
    expect(customerTransferSchema.safeParse({ toAgentId: "" }).success).toBe(false);
  });
});

describe("followUpCreateSchema", () => {
  it("requires a due date", () => {
    expect(followUpCreateSchema.safeParse({ dueAt: "2026-11-17" }).success).toBe(true);
    expect(followUpCreateSchema.safeParse({ dueAt: "" }).success).toBe(false);
  });
});

describe("viewingCreateSchema", () => {
  it("requires customer, property and a start time", () => {
    expect(
      viewingCreateSchema.safeParse({ customerId: "c1", propertyId: "p1", startAt: "2026-11-16T10:00" })
        .success,
    ).toBe(true);
    expect(viewingCreateSchema.safeParse({ propertyId: "p1", startAt: "2026-11-16T10:00" }).success).toBe(
      false,
    );
    expect(
      viewingCreateSchema.safeParse({ customerId: "c1", propertyId: "p1", status: "DONE" }).success,
    ).toBe(false);
  });
});
