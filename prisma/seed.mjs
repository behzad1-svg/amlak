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
    console.error("Set SEED_PASSWORD (min 8 chars) before running prisma/seed.mjs.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  const owner = await prisma.user.upsert({
    where: { phone: "09170000001" },
    update: { passwordHash: hash, role: "OWNER", active: true, name: "مدیر ساج" },
    create: { name: "مدیر ساج", phone: "09170000001", passwordHash: hash, role: "OWNER" },
  });

  const agent1 = await prisma.user.upsert({
    where: { phone: "09170000002" },
    update: { passwordHash: hash, role: "AGENT", active: true, name: "علی احمدی" },
    create: { name: "علی احمدی", phone: "09170000002", passwordHash: hash, role: "AGENT" },
  });

  const agent2 = await prisma.user.upsert({
    where: { phone: "09170000003" },
    update: { passwordHash: hash, role: "AGENT", active: true, name: "مریم حسینی" },
    create: { name: "مریم حسینی", phone: "09170000003", passwordHash: hash, role: "AGENT" },
  });

  async function upsertCustomer(phone, data) {
    return prisma.customer.upsert({
      where: { phone },
      update: {},
      create: { phone, assignedAgentId: agent1.id, ...data },
    });
  }

  const c1 = await upsertCustomer("09170000101", {
    name: "رضا کریمی",
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
  });

  await upsertCustomer("09170000102", {
    name: "سارا محمدی",
    type: "BUYER",
    stage: "QUALIFIED",
    temperature: "WARM",
    preferredDealType: "RENT",
    preferredArea: "سنگی",
    budgetMax: BigInt("500000000"),
    budgetMaxMonthly: BigInt("20000000"),
    nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const c3 = await prisma.customer.upsert({
    where: { phone: "09170000103" },
    update: {},
    create: {
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

  const propCount = await prisma.property.count();
  if (propCount === 0) {
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
        ownerId: c3.id,
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
        ownerId: c3.id,
        listedById: agent2.id,
        visibility: "RESTRICTED",
      },
    });
  }

  console.log("Seed done:", {
    owner: owner.phone,
    agent1: agent1.phone,
    agent2: agent2.phone,
    sampleCustomer: c1.phone,
    note: "passwords reset to SEED_PASSWORD for these phones",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
