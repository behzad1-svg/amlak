// نقد ۵ — خروجی CSV مشتریان و فایل‌ها برای مدیر (پشتیبان‌گیری / انتقال داده).
// فقط OWNER. حداکثر ۵۰۰۰ ردیف در هر خروجی.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

// حداکثر ردیف در هر خروجی — اگر داده بیشتر بود، نام فایل می‌گوید ناقص است
const MAX_EXPORT_ROWS = 5000;

function fileName(kind: string, total: number, returned: number): string {
  const d = new Date().toISOString().slice(0, 10);
  if (total > returned) return `saj-${kind}-${d}-partial-${returned}-of-${total}.csv`;
  return `saj-${kind}-${d}.csv`;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند خروجی بگیرد" }, { status: 403 });
  }
  const kind = req.nextUrl.searchParams.get("kind");
  const headers = { "Content-Type": "text/csv; charset=utf-8" };

  if (kind === "customers") {
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where: { deletedAt: null },
        take: MAX_EXPORT_ROWS,
        orderBy: { createdAt: "desc" },
        include: { assignedAgent: { select: { name: true } } },
      }),
      prisma.customer.count({ where: { deletedAt: null } }),
    ]);
    await createAuditLog({
      actorId: session.user.id,
      action: "DATA_EXPORTED",
      entityType: "Export",
      entityId: "customers",
      newValue: { kind: "customers", rows: customers.length, total },
    });
    const rows: string[][] = [
      ["id", "name", "phone", "type", "stage", "temperature", "source", "preferredType", "preferredDealType", "preferredArea", "preferredAreas", "preferredBeds", "preferredSizeMin", "preferredSizeMax", "budgetMin", "budgetMax", "budgetMaxMonthly", "nextFollowUpAt", "needsManagerReview", "assignedAgent", "createdAt"],
      ...customers.map((c) => [
        c.id, c.name, c.phone, c.type, c.stage, c.temperature, c.source ?? "",
        c.preferredType ?? "", c.preferredDealType ?? "", c.preferredArea ?? "",
        c.preferredAreas.join(" | "), c.preferredBeds?.toString() ?? "", c.preferredSizeMin?.toString() ?? "",
        c.preferredSizeMax?.toString() ?? "", c.budgetMin?.toString() ?? "", c.budgetMax?.toString() ?? "",
        c.budgetMaxMonthly?.toString() ?? "", c.nextFollowUpAt?.toISOString() ?? "",
        c.needsManagerReview ? "yes" : "no", c.assignedAgent.name, c.createdAt.toISOString(),
      ]),
    ];
    return new NextResponse(toCsv(rows), {
      headers: {
        ...headers,
        "Content-Disposition": `attachment; filename="${fileName("customers", total, customers.length)}"`,
        "X-Export-Total": String(total),
        ...(total > customers.length ? { "X-Export-Truncated": "true" } : {}),
      },
    });
  }

  if (kind === "properties") {
    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where: { deletedAt: null },
        take: MAX_EXPORT_ROWS,
        orderBy: { createdAt: "desc" },
        include: { owner: { select: { name: true } }, listedBy: { select: { name: true } } },
      }),
      prisma.property.count({ where: { deletedAt: null } }),
    ]);
    await createAuditLog({
      actorId: session.user.id,
      action: "DATA_EXPORTED",
      entityType: "Export",
      entityId: "properties",
      newValue: { kind: "properties", rows: properties.length, total },
    });
    const rows: string[][] = [
      ["code", "title", "type", "dealType", "status", "region", "address", "salePriceToman", "depositToman", "monthlyRentToman", "sizeSqm", "landSizeSqm", "beds", "floor", "totalFloors", "visibility", "owner", "listedBy", "isAppraised", "createdAt"],
      ...properties.map((p) => [
        p.code ?? "", p.title, p.type, p.dealType, p.status, p.region, p.address ?? "",
        p.salePriceToman?.toString() ?? "", p.depositToman?.toString() ?? "", p.monthlyRentToman?.toString() ?? "",
        p.sizeSqm?.toString() ?? "", p.landSizeSqm?.toString() ?? "", p.beds?.toString() ?? "", p.floor?.toString() ?? "", p.totalFloors?.toString() ?? "",
        p.visibility, p.owner.name, p.listedBy.name, p.isAppraised ? "yes" : "no", p.createdAt.toISOString(),
      ]),
    ];
    return new NextResponse(toCsv(rows), {
      headers: {
        ...headers,
        "Content-Disposition": `attachment; filename="${fileName("properties", total, properties.length)}"`,
        "X-Export-Total": String(total),
        ...(total > properties.length ? { "X-Export-Truncated": "true" } : {}),
      },
    });
  }

  return NextResponse.json({ error: "kind باید customers یا properties باشد" }, { status: 400 });
}
