import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { DEFAULT_BUSHEHR_REGIONS, DEFAULT_PROPERTY_TYPES } from "@/lib/constants";
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
  const regions = regionsRow ? JSON.parse(regionsRow.value) : DEFAULT_BUSHEHR_REGIONS;
  const propertyTypes = typesRow ? JSON.parse(typesRow.value) : DEFAULT_PROPERTY_TYPES;
  return NextResponse.json(serializeBigInt({ regions, propertyTypes }));
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") return NextResponse.json({ error: "فقط مدیر" }, { status: 403 });
  const body = await req.json();
  if (body.regions) {
    if (!Array.isArray(body.regions)) return NextResponse.json({ error: "regions باید آرایه باشد" }, { status: 400 });
    await prisma.appSetting.upsert({ where: { key: "regions" }, update: { value: JSON.stringify(body.regions) }, create: { key: "regions", value: JSON.stringify(body.regions) } });
  }
  if (body.propertyTypes) {
    if (!Array.isArray(body.propertyTypes)) return NextResponse.json({ error: "propertyTypes باید آرایه باشد" }, { status: 400 });
    await prisma.appSetting.upsert({ where: { key: "propertyTypes" }, update: { value: JSON.stringify(body.propertyTypes) }, create: { key: "propertyTypes", value: JSON.stringify(body.propertyTypes) } });
  }
  return NextResponse.json({ ok: true });
}
