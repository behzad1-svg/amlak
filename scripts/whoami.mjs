import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const users = await p.user.findMany({
  where: { active: true },
  select: { phone: true, role: true, name: true },
});
const customers = await p.customer.count();
const properties = await p.property.count();
const deals = await p.deal.count();
console.log(JSON.stringify({ users, customers, properties, deals }, null, 2));
await p.$disconnect();
