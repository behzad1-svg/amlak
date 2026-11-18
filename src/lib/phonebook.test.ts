import { describe, expect, it } from "vitest";
import { phonebookCreateSchema, phonebookUpdateSchema } from "./validation";
import { canAccessPhonebookContact } from "./access";
import { PHONEBOOK_GROUP_LABELS } from "./constants";

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

  it("team contacts are visible to everyone", () => {
    const team = { ownerId: "u1", isPrivate: false };
    expect(canAccessPhonebookContact(owner, team)).toBe(true);
    expect(canAccessPhonebookContact(other, team)).toBe(true);
  });

  it("private contacts are visible only to the owner and OWNER", () => {
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
