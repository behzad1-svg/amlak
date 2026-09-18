import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.property.findMany({ select: { code: true, title: true } });
console.log(JSON.stringify(rows, null, 2));
const seq = await p.appSetting.findUnique({ where: { key: "propertyCodeSeq" } });
console.log("seq", seq);
await p.$disconnect();
