import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const code = `F-${Date.now().toString().slice(-4)}`;
try {
  const owner = await p.customer.findFirst();
  const user = await p.user.findFirst({ where: { role: "OWNER" } });
  console.log("owner", owner?.id, "user", user?.id);
  const prop = await p.property.create({
    data: {
      code,
      title: "Direct prisma test",
      type: "APARTMENT",
      dealType: "SALE",
      salePriceToman: BigInt(1000),
      region: "بهمنی",
      ownerId: owner.id,
      listedById: user.id,
      unitsPerFloor: 2,
      unitCount: 6,
      hasElevator: true,
      hasTerrace: true,
    },
  });
  console.log("CREATED", prop.id, prop.code, prop.unitsPerFloor, prop.hasElevator);
  await p.property.delete({ where: { id: prop.id } });
  console.log("DELETED_OK");
} catch (e) {
  console.error("PRISMA_ERR", e.message);
  console.error(String(e.stack).split("\n").slice(0, 10).join("\n"));
} finally {
  await p.$disconnect();
}
