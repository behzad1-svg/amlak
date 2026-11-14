// نقد ۵ — خروجی CSV مشتریان و فایل‌ها برای مدیر (پشتیبان‌گیری / انتقال داده).
// فقط OWNER. حداکثر ۵۰۰۰ ردیف در هر خروجی.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows: string[][]): string {
  // BOM برای باز شدن درست در Excel
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

function fileName(kind: string): string {
  const d = new Date().toISOString().slice(0, 10);
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
    const customers = await prisma.customer.findMany({
      take: 5000,
      orderBy: { createdAt: "desc" },
      include: { assignedAgent: { select: { name: true } } },
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
      headers: { ...headers, "Content-Disposition": `attachment; filename="${fileName("customers")}"` },
    });
  }

  if (kind === "properties") {
    const properties = await prisma.property.findMany({
      take: 5000,
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { name: true } }, listedBy: { select: { name: true } } },
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
      headers: { ...headers, "Content-Disposition": `attachment; filename="${fileName("properties")}"` },
    });
  }

  return NextResponse.json({ error: "kind باید customers یا properties باشد" }, { status: 400 });
}
