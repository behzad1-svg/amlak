-- Partial unique indexes: at most one automatic cashbox entry per deal/share.
-- `prisma db push` cannot create partial indexes — run this manually on the VPS
-- AFTER `prisma db push`.
-- The reversal entries (OUT for a deal, IN for a share) are the opposite type,
-- so they never conflict with these indexes; the single IN/OUT row stays in
-- place and a re-settle only removes its reversal record. The API returns 409
-- (P2002) when two concurrent requests race past the findFirst check.
CREATE UNIQUE INDEX IF NOT EXISTS "CashboxEntry_dealId_in_unique" ON "CashboxEntry"("dealId") WHERE "type" = 'IN' AND "dealId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "CashboxEntry_shareId_out_unique" ON "CashboxEntry"("shareId") WHERE "type" = 'OUT' AND "shareId" IS NOT NULL;
