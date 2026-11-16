import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { DEFAULT_BUSHEHR_REGIONS, DEFAULT_PROPERTY_TYPES, DEFAULT_CUSTOMER_TAGS } from "@/lib/constants";
import { getTaxRatePct } from "@/lib/settings";
import { serializeBigInt } from "@/lib/utils";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const regionsRow = await prisma.appSetting.findUnique({ where: { key: "regions" } });
  const typesRow = await prisma.appSetting.findUnique({ where: { key: "propertyTypes" } });
  const tagsRow = await prisma.appSetting.findUnique({ where: { key: "customerTags" } });
  const regions = regionsRow ? JSON.parse(regionsRow.value) : DEFAULT_BUSHEHR_REGIONS;
  const propertyTypes = typesRow ? JSON.parse(typesRow.value) : DEFAULT_PROPERTY_TYPES;
  const customerTags = tagsRow ? JSON.parse(tagsRow.value) : DEFAULT_CUSTOMER_TAGS;
  const taxRate = await getTaxRatePct();
  return NextResponse.json(serializeBigInt({ regions, propertyTypes, customerTags, taxRate }));
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") return NextResponse.json({ error: "فقط مدیر" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "بدنهٔ درخواست معتبر نیست" }, { status: 400 });
  }
  if (body.regions) {
    if (!Array.isArray(body.regions)) return NextResponse.json({ error: "regions باید آرایه باشد" }, { status: 400 });
    await prisma.appSetting.upsert({ where: { key: "regions" }, update: { value: JSON.stringify(body.regions) }, create: { key: "regions", value: JSON.stringify(body.regions) } });
  }
  if (body.propertyTypes) {
    if (!Array.isArray(body.propertyTypes)) return NextResponse.json({ error: "propertyTypes باید آرایه باشد" }, { status: 400 });
    await prisma.appSetting.upsert({ where: { key: "propertyTypes" }, update: { value: JSON.stringify(body.propertyTypes) }, create: { key: "propertyTypes", value: JSON.stringify(body.propertyTypes) } });
  }
  if (body.taxRate !== undefined) {
    const n = Number(body.taxRate);
    if (!Number.isFinite(n) || n < 0 || n > 100) return NextResponse.json({ error: "taxRate باید عددی بین ۰ تا ۱۰۰ باشد" }, { status: 400 });
    await prisma.appSetting.upsert({ where: { key: "taxRate" }, update: { value: JSON.stringify(n) }, create: { key: "taxRate", value: JSON.stringify(n) } });
  }
  if (body.customerTags !== undefined) {
    if (!Array.isArray(body.customerTags) || body.customerTags.length > 20 || body.customerTags.some((t: unknown) => typeof t !== "string" || !t.trim() || t.length > 30)) {
      return NextResponse.json({ error: "customerTags باید آرایه‌ای از رشته‌های حداکثر ۳۰ کاراکتری باشد" }, { status: 400 });
    }
    const tags = [...new Set(body.customerTags.map((t: string) => t.trim()))];
    await prisma.appSetting.upsert({ where: { key: "customerTags" }, update: { value: JSON.stringify(tags) }, create: { key: "customerTags", value: JSON.stringify(tags) } });
  }
  return NextResponse.json({ ok: true });
}
