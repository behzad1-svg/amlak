import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { findInvalidQueryParam, phonebookCreateSchema } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { persianSearchOr } from "@/lib/search";

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

  const and: Record<string, unknown>[] = [{ deletedAt: null }];
  // Didar-style view permission: a private contact is visible only to its
  // owner (and OWNER); team contacts are visible to everyone.
  if (session.user.role !== "OWNER") {
    and.push({ OR: [{ isPrivate: false }, { ownerId: session.user.id }] });
  }
  if (search) {
    and.push({
      OR: [
        ...persianSearchOr(["name"], search),
        { phone: { contains: search } },
        { phone2: { contains: search } },
        { email: { contains: search } },
      ],
    });
  }
  if (group) and.push({ group });
  if (vip) and.push({ isVip: true });
  if (pinned) and.push({ isPinned: true });

  const where = { AND: and } as Record<string, unknown>;
  const [contacts, total] = await Promise.all([
    prisma.phonebookContact.findMany({
      where,
      include: { owner: { select: { id: true, name: true } } },
      orderBy: [{ isPinned: "desc" }, { name: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.phonebookContact.count({ where }),
  ]);

  const isDefaultPage = !searchParams.has("page") && !searchParams.has("limit");
  if (isDefaultPage) return NextResponse.json(contacts);
  return NextResponse.json({ contacts, total, page, limit });
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
    return NextResponse.json(
      { error: "این شماره در دفترچه تلفن ثبت شده است", existingId: clash.id },
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

  let contact: Awaited<ReturnType<typeof prisma.phonebookContact.create>>;
  try {
    contact = deletedMatch
      ? await prisma.phonebookContact.update({
          where: { id: deletedMatch.id },
          data: { ...data, deletedAt: null },
        })
      : await prisma.phonebookContact.create({ data });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const again = await prisma.phonebookContact.findFirst({ where: { phone: d.phone } });
      return NextResponse.json(
        { error: "این شماره در دفترچه تلفن ثبت شده است", existingId: again?.id ?? null },
        { status: 409 },
      );
    }
    throw e;
  }

  await createAuditLog({
    actorId: session.user.id,
    action: deletedMatch ? "PHONEBOOK_RESTORED" : "PHONEBOOK_CREATED",
    entityType: "PhonebookContact",
    entityId: contact.id,
    newValue: { name: d.name } as never,
  });

  return NextResponse.json(contact, { status: 201 });
}
