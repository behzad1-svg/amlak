import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  const codes = await p.property.findMany({
    where: { code: { startsWith: "F-" } },
    select: { code: true },
  });
  console.log("codes", codes.length);
  const row = await p.appSetting.findUnique({ where: { key: "propertyCodeSeq" } });
  console.log("seq", row);
} catch (e) {
  console.error(e);
} finally {
  await p.$disconnect();
}
