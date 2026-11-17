-- Dedupe before unique constraints (run via prisma db execute / migrate)
-- 1) Customer (phone, type): keep earliest ACTIVE row per (phone, type); suffix later
--    active duplicates then soft-delete them. Rows already soft-deleted never
--    conflict with the partial unique index, so they are left alone.

WITH ranked AS (
  SELECT id, phone, type,
         ROW_NUMBER() OVER (PARTITION BY phone, type ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Customer"
  WHERE "deletedAt" IS NULL
)
UPDATE "Customer" c
SET phone = c.phone || '-dup' || substr(c.id, length(c.id) - 5),
    "deletedAt" = NOW()
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

-- 2) PropertyAccess: keep latest grant per (propertyId, userId); delete older rows

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "propertyId", "userId" ORDER BY "grantedAt" DESC, id DESC) AS rn
  FROM "PropertyAccess"
)
DELETE FROM "PropertyAccess" pa
USING ranked r
WHERE pa.id = r.id AND r.rn > 1;
