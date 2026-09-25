import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.property.findMany({ where: { deletedAt: null }, select: { id: true, code: true, title: true } });
for (const r of rows) {
  if (!r.title || /\?{2,}/.test(r.title) || /Smoke/i.test(r.title)) {
    await p.property.update({ where: { id: r.id }, data: { deletedAt: new Date() } });
    console.log("deleted", r.code, r.title);
  }
}
const left = await p.property.findMany({ where: { deletedAt: null }, select: { code: true, title: true } });
console.log("left", left);
await p.$disconnect();
