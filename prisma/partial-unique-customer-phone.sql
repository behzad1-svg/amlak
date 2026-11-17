-- Partial unique index: one ACTIVE customer per (phone, type).
-- `prisma db push` cannot create partial indexes — run this manually on the VPS
-- AFTER `prisma db push` (which drops the old global @@unique) and AFTER
-- prisma/dedupe-before-unique.sql (which removes active duplicates per (phone, type)).
-- The API restore path (POST /api/customers) is unaffected: it restores a
-- soft-deleted record with the same phone+type instead of creating a new one.
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_phone_type_active_idx"
  ON "Customer" (phone, type)
  WHERE "deletedAt" IS NULL;
