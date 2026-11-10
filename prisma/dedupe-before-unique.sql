-- Dedupe before unique constraints (run via prisma db execute / migrate)
-- 1) Customer.phone: keep earliest row per phone; suffix later duplicates then soft-delete them

WITH ranked AS (
  SELECT id, phone,
         ROW_NUMBER() OVER (PARTITION BY phone ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Customer"
)
UPDATE "Customer" c
SET phone = c.phone || '-dup' || substr(c.id, length(c.id) - 5),
    "deletedAt" = COALESCE(c."deletedAt", NOW())
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
