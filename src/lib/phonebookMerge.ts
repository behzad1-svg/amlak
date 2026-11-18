// Unified phonebook directory: phonebook contacts + customers in ONE list.
// A customer shows with the مالک/خریدار tag (OWNER/SELLER -> مالک,
// BUYER/TENANT -> خریدار — the same two-sided split as the customer board).
// No data is copied: customer rows are read live from the customers table,
// so a number is never stored in two places.

export type PhonebookRowInput = {
  id: string;
  name: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  group: string;
  tags: string[];
  notes: string | null;
  isVip: boolean;
  isPinned: boolean;
  isPrivate: boolean;
  owner: { id: string; name: string } | null;
  createdAt: string | Date;
};

export type CustomerRowInput = {
  id: string;
  name: string;
  phone: string;
  type: string;
  tags: string[];
  notes: string | null;
  assignedAgent: { id: string; name: string } | null;
  createdAt: string | Date;
};

export type MergedPhonebookRow = {
  id: string;
  name: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  group: string;
  tags: string[];
  notes: string | null;
  isVip: boolean;
  isPinned: boolean;
  isPrivate: boolean;
  owner: { id: string; name: string } | null;
  createdAt: string;
  source: "phonebook" | "customer";
  customerId: string | null;
};

/** Customer type -> phonebook group: seller is an owner, tenant is a buyer. */
export function customerTypeToPhonebookGroup(type: string): "OWNER" | "BUYER" {
  return type === "OWNER" || type === "SELLER" ? "OWNER" : "BUYER";
}

/** Merge the two lists into one directory, one row per phone number.
 *  A phonebook entry wins over a customer with the same number (it carries
 *  the group/tags the user chose) and gets linked to that customer. */
export function mergePhonebookRows(
  phonebook: PhonebookRowInput[],
  customers: CustomerRowInput[],
): MergedPhonebookRow[] {
  const byPhone = new Map<string, MergedPhonebookRow>();
  const rows: MergedPhonebookRow[] = [];
  for (const c of phonebook) {
    const row: MergedPhonebookRow = {
      ...c,
      createdAt: String(c.createdAt),
      source: "phonebook",
      customerId: null,
    };
    byPhone.set(c.phone, row);
    rows.push(row);
  }
  for (const cu of customers) {
    const existing = byPhone.get(cu.phone);
    if (existing) {
      existing.customerId = cu.id;
      continue;
    }
    rows.push({
      id: `customer:${cu.id}`,
      name: cu.name,
      phone: cu.phone,
      phone2: null,
      email: null,
      group: customerTypeToPhonebookGroup(cu.type),
      tags: cu.tags,
      notes: cu.notes,
      isVip: false,
      isPinned: false,
      isPrivate: false,
      owner: cu.assignedAgent,
      createdAt: String(cu.createdAt),
      source: "customer",
      customerId: cu.id,
    });
  }
  // Pinned first (phonebook only), then name A-Z.
  return rows.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return a.name.localeCompare(b.name, "fa");
  });
}
