import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession, hashPassword } from "@/lib/auth";
import { DEFAULT_BUSHEHR_REGIONS } from "@/lib/constants";

/**
 * Destructive demo seed — locked down:
 * - production: always 403
 * - non-production: requires OWNER session + SEED_ENABLED=true
 * - never creates users with a non-bcrypt hash
 * - wipe is opt-in via body/query `wipe=true` (customers only), never implicit full wipe of users
 */

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

function seedEnabled(): boolean {
  return process.env.SEED_ENABLED === "true";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function GET(req: NextRequest) {
  return handleSeed(req);
}

export async function POST(req: NextRequest) {
  return handleSeed(req);
}

async function handleSeed(req: NextRequest) {
  if (isProduction() || !seedEnabled()) {
    return NextResponse.json(
      { error: "مسیر seed غیرفعال است. برای محیط dev فلگ SEED_ENABLED=true بگذارید." },
      { status: 403 }
    );
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند seed اجرا کند" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  let wipe = searchParams.get("wipe") === "true";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.wipe === true) wipe = true;
    } catch {
      // empty body ok
    }
  }

  try {
    // Ensure at least one OWNER exists with a real bcrypt hash (dev-only path)
    let owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
    if (!owner) {
      const phone = process.env.SEED_OWNER_PHONE ?? "09123456789";
      const password = process.env.SEED_OWNER_PASSWORD;
      if (!password || password.length < 8) {
        return NextResponse.json(
          { error: "SEED_OWNER_PASSWORD باید حداقل ۸ کاراکتر باشد تا کاربر OWNER ساخته شود" },
          { status: 400 }
        );
      }
      owner = await prisma.user.create({
        data: {
          name: "مدیر سیستم",
          phone,
          passwordHash: await hashPassword(password),
          role: "OWNER",
        },
      });
    }

    if (wipe) {
      await prisma.customer.deleteMany({});
    }

    // Only insert demo customers if table is empty or wipe was requested
    const existingCount = await prisma.customer.count();
    if (existingCount > 0 && !wipe) {
      return NextResponse.json({
        message: "Seed skipped: customers already exist. Pass wipe=true to replace them.",
        ownerPhone: owner.phone,
        customerCount: existingCount,
      });
    }

    const regions = DEFAULT_BUSHEHR_REGIONS;
    await prisma.customer.createMany({
      data: [
        {
          name: "محمد رضایی",
          phone: "09121234567",
          type: "BUYER",
          stage: "INITIAL_CONTACT",
          temperature: "HOT",
          preferredArea: regions[0] ?? "بهمنی",
          budgetMax: BigInt(3000000000),
          source: "WEBSITE",
          nextFollowUpAt: new Date(),
          assignedAgentId: owner.id,
        },
        {
          name: "سعید رحیمی",
          phone: "09382201190",
          type: "BUYER",
          stage: "VIEWING",
          temperature: "WARM",
          preferredArea: regions[1] ?? "سنگی",
          budgetMax: BigInt(2000000000),
          source: "INSTAGRAM",
          nextFollowUpAt: new Date(Date.now() + 86400000),
          assignedAgentId: owner.id,
        },
        {
          name: "مریم حسینی",
          phone: "09354418820",
          type: "TENANT",
          stage: "QUALIFIED",
          temperature: "COLD",
          preferredArea: regions[2] ?? "عاشوری",
          budgetMax: BigInt(800000000),
          source: "DIRECT_CALL",
          nextFollowUpAt: new Date(),
          assignedAgentId: owner.id,
        },
      ],
    });

    return NextResponse.json({
      message: "Database seeded successfully!",
      wiped: wipe,
      ownerPhone: owner.phone,
      regionsHint: "مناطق از DEFAULT_BUSHEHR_REGIONS استفاده شد",
    });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json({ error: "Failed to seed database" }, { status: 500 });
  }
}
