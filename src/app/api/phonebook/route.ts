import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { findInvalidQueryParam, phonebookCreateSchema } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { persianSearchOr } from "@/lib/search";
import { mergePhonebookRows } from "@/lib/phonebookMerge";

const GROUPS = ["BUILDER", "OWNER", "BUYER", "COLLEAGUE", "OTHER"];

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const group = searchParams.get("group");
  const vip = searchParams.get("vip") === "true";
  const pinned = searchParams.get("pinned") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "100")));
  const invalidParam = findInvalidQueryParam([
    { name: "page", value: searchParams.get("page") },
    { name: "limit", value: searchParams.get("limit") },
  ]);
  if (invalidParam) {
    return NextResponse.json({ error: `مقدار «${invalidParam}» معتبر نیست` }, { status: 400 });
  }
  if (group && !GROUPS.includes(group)) {
    return NextResponse.json({ error: "مقدار «group» معتبر نیست" }, { status: 400 });
  }

  const isOwner = session.user.role === "OWNER";
  const MERGE_CAP = 500;

  // Phonebook contacts: an advisor sees only the numbers they registered
  // themselves — the same rule as files/customers; OWNER sees all.
  const pbAnd: Record<string, unknown>[] = [{ deletedAt: null }];
  if (!isOwner) pbAnd.push({ ownerId: session.user.id });
  if (search) {
    pbAnd.push({
      OR: [
        ...persianSearchOr(["name"], search),
        { phone: { contains: search } },
        { phone2: { contains: search } },
        { email: { contains: search } },
      ],
    });
  }
  if (group) pbAnd.push({ group });
  if (vip) pbAnd.push({ isVip: true });
  if (pinned) pbAnd.push({ isPinned: true });

  // Customers appear in the same list, tagged مالک/خریدار — read live, never
  // copied. They have no VIP/pin flags, so those filters exclude them; and
  // they never map to the سازنده/همکار/سایر groups.
  let includeCustomers = !vip && !pinned;
  const cuAnd: Record<string, unknown>[] = [{ deletedAt: null }];
  if (!isOwner) cuAnd.push({ assignedAgentId: session.user.id });
  if (search) {
    cuAnd.push({
      OR: [...persianSearchOr(["name"], search), { phone: { contains: search } }],
    });
  }
  if (group === "OWNER") cuAnd.push({ type: { in: ["OWNER", "SELLER"] } });
  else if (group === "BUYER") cuAnd.push({ type: { in: ["BUYER", "TENANT"] } });
  else if (group) includeCustomers = false;

  const [contacts, customers] = await Promise.all([
    prisma.phonebookContact.findMany({
      where: { AND: pbAnd } as Record<string, unknown>,
      include: { owner: { select: { id: true, name: true } } },
      orderBy: [{ isPinned: "desc" }, { name: "asc" }, { createdAt: "desc" }],
      take: MERGE_CAP,
    }),
    includeCustomers
      ? prisma.customer.findMany({
          where: { AND: cuAnd } as Record<string, unknown>,
          select: {
            id: true,
            name: true,
            phone: true,
            type: true,
            tags: true,
            notes: true,
            createdAt: true,
            assignedAgent: { select: { id: true, name: true } },
          },
          orderBy: { name: "asc" },
          take: MERGE_CAP,
        })
      : [],
  ]);

  // One directory: merge in memory (small lists) and paginate the result,
  // so counts and "load more" stay consistent across both sources.
  const merged = mergePhonebookRows(contacts, customers);
  const total = merged.length;

  const isDefaultPage = !searchParams.has("page") && !searchParams.has("limit");
  if (isDefaultPage) return NextResponse.json(merged);
  const start = (page - 1) * limit;
  return NextResponse.json({ contacts: merged.slice(start, start + limit), total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (!hasPermission(session.user, "canCreatePhonebook")) {
    return NextResponse.json({ error: "اجازه ثبت دفترچه تلفن ندارید" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = phonebookCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  // Didar-style duplicate rule: one active record per mobile number.
  const clash = await prisma.phonebookContact.findFirst({
    where: { phone: d.phone, deletedAt: null },
  });
  if (clash) {
    // existingId فقط وقتی برگردد که رکورد مال خودِ درخواست‌دهنده (یا مدیر) باشد — IDOR fix 2026-11-21
    const ownClash = session.user.role === "OWNER" || clash.ownerId === session.user.id;
    return NextResponse.json(
      { error: "این شماره در دفترچه تلفن ثبت شده است", ...(ownClash ? { existingId: clash.id } : {}) },
      { status: 409 },
    );
  }

  // A soft-deleted record with the same number is restored instead of
  // creating a second row (the partial unique index would reject it).
  const deletedMatch = await prisma.phonebookContact.findFirst({
    where: { phone: d.phone, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
  });

  const data = {
    name: d.name,
    phone: d.phone,
    phone2: d.phone2 ?? null,
    email: d.email ?? null,
    group: (d.group as never) ?? "OTHER",
    tags: d.tags ?? [],
    notes: d.notes ?? null,
    isVip: d.isVip ?? false,
    isPinned: d.isPinned ?? false,
    isPrivate: d.isPrivate ?? false,
    ownerId: session.user.id,
  };

  // بازیابی رکورد حذف‌شده فقط وقتی مال خودِ ثبت‌کننده (یا مدیر) باشد؛
  // وگرنه رکورد تازه ساخته می‌شود تا مالکیت دیگری تصاحب نشود — IDOR fix 2026-11-21
  const restorableMatch =
    deletedMatch && (session.user.role === "OWNER" || deletedMatch.ownerId === session.user.id)
      ? deletedMatch
      : null;

  let contact: Awaited<ReturnType<typeof prisma.phonebookContact.create>>;
  try {
    contact = restorableMatch
      ? await prisma.phonebookContact.update({
          where: { id: restorableMatch.id },
          data: { ...data, deletedAt: null },
        })
      : await prisma.phonebookContact.create({ data });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const again = await prisma.phonebookContact.findFirst({ where: { phone: d.phone } });
      const ownClash = !!again && (session.user.role === "OWNER" || again.ownerId === session.user.id);
      return NextResponse.json(
        { error: "این شماره در دفترچه تلفن ثبت شده است", ...(ownClash ? { existingId: again?.id ?? null } : {}) },
        { status: 409 },
      );
    }
    throw e;
  }

  await createAuditLog({
    actorId: session.user.id,
    action: restorableMatch ? "PHONEBOOK_RESTORED" : "PHONEBOOK_CREATED",
    entityType: "PhonebookContact",
    entityId: contact.id,
    newValue: { name: d.name } as never,
  });

  return NextResponse.json(contact, { status: 201 });
}
