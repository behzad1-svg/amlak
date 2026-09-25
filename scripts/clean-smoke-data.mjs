import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const junkName = /^(Smoke|Owner)\b/i;

try {
  // Soft-delete smoke properties
  const props = await p.property.findMany({
    where: { OR: [{ title: { contains: "Smoke" } }, { title: { contains: "smoke" } }] },
    select: { id: true, code: true, title: true },
  });
  for (const prop of props) {
    await p.property.update({ where: { id: prop.id }, data: { deletedAt: new Date() } });
    console.log("soft-deleted property", prop.code, prop.title);
  }

  // Soft-delete junk customers (Smoke / Owner*)
  const custs = await p.customer.findMany({
    where: { deletedAt: null, OR: [{ name: { contains: "Smoke" } }, { name: { startsWith: "Owner" } }] },
    select: { id: true, name: true, phone: true },
  });
  for (const c of custs) {
    // only delete if not used as owner of a live property
    const live = await p.property.count({ where: { ownerId: c.id, deletedAt: null } });
    if (live > 0) {
      console.log("skip customer (still owns live file)", c.name);
      continue;
    }
    await p.customer.update({ where: { id: idFix(c.id) }, data: { deletedAt: new Date() } });
    console.log("soft-deleted customer", c.name, c.phone);
  }

  function idFix(id) { return id; }

  const remaining = await p.property.count({ where: { deletedAt: null } });
  const remainingCust = await p.customer.count({ where: { deletedAt: null } });
  console.log({ remainingProperties: remaining, remainingCustomers: remainingCust });
} catch (e) {
  console.error(e);
} finally {
  await p.$disconnect();
}
