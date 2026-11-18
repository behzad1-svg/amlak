import { describe, expect, it } from "vitest";
import { phonebookCreateSchema, phonebookUpdateSchema } from "./validation";
import { canAccessPhonebookContact } from "./access";
import { PHONEBOOK_GROUP_LABELS } from "./constants";
import {
  customerTypeToPhonebookGroup,
  mergePhonebookRows,
  type CustomerRowInput,
  type PhonebookRowInput,
} from "./phonebookMerge";

const valid = {
  name: "آقای بنیادی سازنده",
  phone: "09171745917",
  group: "BUILDER",
};

describe("phonebookCreateSchema", () => {
  it("accepts a minimal valid contact", () => {
    expect(phonebookCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts all optional fields", () => {
    expect(
      phonebookCreateSchema.safeParse({
        ...valid,
        phone2: "09170000001",
        email: "a@example.com",
        tags: ["بوشهر"],
        notes: "یادداشت",
        isVip: true,
        isPinned: true,
        isPrivate: true,
      }).success,
    ).toBe(true);
  });

  it("rejects a missing name and a short phone", () => {
    expect(phonebookCreateSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(phonebookCreateSchema.safeParse({ ...valid, phone: "123" }).success).toBe(false);
    expect(phonebookCreateSchema.safeParse({ ...valid, phone: "091700009999" }).success).toBe(false);
  });

  it("rejects an invalid group and a bad email", () => {
    expect(phonebookCreateSchema.safeParse({ ...valid, group: "FOO" }).success).toBe(false);
    expect(phonebookCreateSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects more than 10 tags", () => {
    expect(
      phonebookCreateSchema.safeParse({ ...valid, tags: Array.from({ length: 11 }, () => "x") }).success,
    ).toBe(false);
  });
});

describe("phonebookUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(phonebookUpdateSchema.safeParse({ isVip: true }).success).toBe(true);
    expect(phonebookUpdateSchema.safeParse({ phone: "09170000002" }).success).toBe(true);
    expect(phonebookUpdateSchema.safeParse({ phone: "12" }).success).toBe(false);
  });
});

describe("canAccessPhonebookContact", () => {
  const owner = { id: "u1", role: "AGENT" };
  const other = { id: "u2", role: "AGENT" };
  const manager = { id: "u3", role: "OWNER" };

  // Behzad's rule (same as files/customers): an advisor sees only the
  // numbers they registered themselves; OWNER sees all.
  it("a contact is visible only to its owner and OWNER", () => {
    const team = { ownerId: "u1", isPrivate: false };
    expect(canAccessPhonebookContact(owner, team)).toBe(true);
    expect(canAccessPhonebookContact(other, team)).toBe(false);
    expect(canAccessPhonebookContact(manager, team)).toBe(true);
  });

  it("private contacts follow the same own-only rule", () => {
    const priv = { ownerId: "u1", isPrivate: true };
    expect(canAccessPhonebookContact(owner, priv)).toBe(true);
    expect(canAccessPhonebookContact(other, priv)).toBe(false);
    expect(canAccessPhonebookContact(manager, priv)).toBe(true);
  });
});

describe("PHONEBOOK_GROUP_LABELS", () => {
  it("covers all five groups", () => {
    expect(Object.keys(PHONEBOOK_GROUP_LABELS).sort()).toEqual(
      ["BUILDER", "BUYER", "COLLEAGUE", "OTHER", "OWNER"].sort(),
    );
    expect(PHONEBOOK_GROUP_LABELS.BUILDER).toBe("سازنده");
  });
});

describe("customerTypeToPhonebookGroup", () => {
  it("maps seller to مالک and tenant to خریدار (two sides only)", () => {
    expect(customerTypeToPhonebookGroup("OWNER")).toBe("OWNER");
    expect(customerTypeToPhonebookGroup("SELLER")).toBe("OWNER");
    expect(customerTypeToPhonebookGroup("BUYER")).toBe("BUYER");
    expect(customerTypeToPhonebookGroup("TENANT")).toBe("BUYER");
  });
});

describe("mergePhonebookRows", () => {
  const pb = (over: Partial<PhonebookRowInput>): PhonebookRowInput => ({
    id: "pb1",
    name: "آقای بنیادی سازنده",
    phone: "09171745917",
    phone2: null,
    email: null,
    group: "BUILDER",
    tags: [],
    notes: null,
    isVip: false,
    isPinned: false,
    isPrivate: false,
    owner: { id: "u1", name: "مدیر ساج" },
    createdAt: "2026-11-18T00:00:00.000Z",
    ...over,
  });
  const cu = (over: Partial<CustomerRowInput>): CustomerRowInput => ({
    id: "cu1",
    name: "مشتری تست مالک",
    phone: "09170000014",
    type: "OWNER",
    tags: [],
    notes: null,
    assignedAgent: { id: "u1", name: "مدیر ساج" },
    createdAt: "2026-11-18T00:00:00.000Z",
    ...over,
  });

  it("appends customers as customer rows with the مالک/خریدار group", () => {
    const rows = mergePhonebookRows([], [cu({ type: "SELLER" }), cu({ id: "cu2", name: "ب", phone: "09170000015", type: "TENANT" })]);
    expect(rows).toHaveLength(2);
    // Sorted by name: "ب" comes before "مشتری تست مالک".
    expect(rows.map((r) => [r.source, r.group, r.customerId])).toEqual([
      ["customer", "BUYER", "cu2"],
      ["customer", "OWNER", "cu1"],
    ]);
    expect(rows[1].id).toBe("customer:cu1");
    expect(rows[1].phone2).toBeNull();
  });

  it("dedupes by phone: the phonebook entry wins and links to the customer", () => {
    const rows = mergePhonebookRows(
      [pb({ phone: "09170000014", group: "BUILDER" })],
      [cu({ phone: "09170000014" })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("phonebook");
    expect(rows[0].group).toBe("BUILDER");
    expect(rows[0].customerId).toBe("cu1");
  });

  it("sorts pinned first, then by name", () => {
    const rows = mergePhonebookRows(
      [pb({ id: "pb2", name: "ب", phone: "09170000002", isPinned: true }), pb({ id: "pb3", name: "الف", phone: "09170000003" })],
      [cu({ id: "cu9", name: "پ", phone: "09170000009", type: "BUYER" })],
    );
    expect(rows.map((r) => r.name)).toEqual(["ب", "الف", "پ"]);
  });
});
