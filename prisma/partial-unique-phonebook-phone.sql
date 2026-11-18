-- Partial unique index: one ACTIVE phonebook contact per mobile number.
-- `prisma db push` cannot create partial indexes — run this manually on the VPS
-- AFTER `prisma db push`. The API restore path (POST /api/phonebook) is
-- unaffected: it restores a soft-deleted record with the same phone instead
-- of creating a new one.
CREATE UNIQUE INDEX IF NOT EXISTS "PhonebookContact_phone_active_idx"
  ON "PhonebookContact" (phone)
  WHERE "deletedAt" IS NULL;
