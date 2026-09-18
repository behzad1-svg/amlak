import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
    console.error("Refusing to seed in production. Set SEED_ALLOW_PRODUCTION=true only if you really mean it.");
    process.exit(1);
  }

  const password = process.env.SEED_PASSWORD ?? process.env.SEED_OWNER_PASSWORD;
  if (!password || password.length < 8) {
    console.error(
      "Set SEED_PASSWORD (min 8 chars) before running prisma/seed.mjs. Weak defaults are disabled."
    );
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  const owner = await prisma.user.upsert({
    where: { phone: "09170000001" },
    update: {},
    create: { name: "مدیر ساج", phone: "09170000001", passwordHash: hash, role: "OWNER" },
  });

  const agent1 = await prisma.user.upsert({
    where: { phone: "09170000002" },
    update: {},
    create: { name: "علی احمدی", phone: "09170000002", passwordHash: hash, role: "AGENT" },
  });

  const agent2 = await prisma.user.upsert({
    where: { phone: "09170000003" },
    update: {},
    create: { name: "مریم حسینی", phone: "09170000003", passwordHash: hash, role: "AGENT" },
  });

  const c1 = await prisma.customer.create({
    data: {
      name: "رضا کریمی",
      phone: "09170000101",
      type: "BUYER",
      stage: "INITIAL_CONTACT",
      temperature: "HOT",
      preferredDealType: "SALE",
      preferredType: "APARTMENT",
      preferredArea: "بهمنی",
      budgetMax: BigInt("3500000000"),
      preferredSizeMin: 80,
      preferredSizeMax: 120,
      nextFollowUpAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      assignedAgentId: agent1.id,
    },
  });

  await prisma.customer.create({
    data: {
      name: "سارا محمدی",
      phone: "09170000102",
      type: "BUYER",
      stage: "QUALIFIED",
      temperature: "WARM",
      preferredDealType: "RENT",
      preferredArea: "سنگی",
      budgetMax: BigInt("500000000"),
      nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      assignedAgentId: agent1.id,
    },
  });

  const c3 = await prisma.customer.create({
    data: {
      name: "حسن رضایی",
      phone: "09170000103",
      type: "SELLER",
      stage: "INITIAL_CONTACT",
      temperature: "WARM",
      needsManagerReview: true,
      managerReviewReason: "نیاز به کارشناسی قیمت",
      managerReviewRequestedAt: new Date(),
      assignedAgentId: agent2.id,
    },
  });

  const ownerCustomer = c3;

  await prisma.property.create({
    data: {
      title: "آپارتمان ۲ خوابه بهمنی",
      type: "APARTMENT",
      dealType: "SALE",
      salePriceToman: BigInt("3200000000"),
      sizeSqm: 95,
      beds: 2,
      region: "بهمنی",
      address: "بهمنی، خیابان اول",
      ownerId: ownerCustomer.id,
      listedById: agent1.id,
      visibility: "TEAM_VISIBLE",
    },
  });

  await prisma.property.create({
    data: {
      title: "ویلا ساحلی تنگک",
      type: "VILLA",
      dealType: "SALE",
      salePriceToman: BigInt("8500000000"),
      sizeSqm: 250,
      beds: 4,
      region: "تنگک",
      ownerId: ownerCustomer.id,
      listedById: agent2.id,
      visibility: "RESTRICTED",
    },
  });

  await prisma.notification.create({
    data: {
      userId: owner.id,
      type: "FOLLOW_UP_OVERDUE",
      priority: "HIGH",
      relatedType: "Customer",
      relatedId: c3.id,
      message: `درخواست بررسی مدیر: ${c3.name} — نیاز به کارشناسی قیمت`,
    },
  });

  console.log("Seed done:", {
    owner: owner.phone,
    agent1: agent1.phone,
    agent2: agent2.phone,
    note: `password from SEED_PASSWORD (shared by demo users); customer ${c1.phone} created`,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
