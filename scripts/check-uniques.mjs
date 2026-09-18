import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const phones = await p.$queryRawUnsafe(
  `SELECT phone, COUNT(*)::int AS c FROM "Customer" GROUP BY phone HAVING COUNT(*)>1`
);
const acc = await p.$queryRawUnsafe(
  `SELECT "propertyId","userId",COUNT(*)::int AS c FROM "PropertyAccess" GROUP BY 1,2 HAVING COUNT(*)>1`
);
console.log(JSON.stringify({ phones, acc }, null, 2));
await p.$disconnect();
