-- Backfill property codes before/after adding unique code column
-- Format: F-0001, F-0002, ... ordered by createdAt

UPDATE "Property" SET "code" = NULL WHERE "code" = '';

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Property"
  WHERE "code" IS NULL
)
UPDATE "Property" p
SET "code" = 'F-' || LPAD(r.rn::text, 4, '0')
FROM ranked r
WHERE p.id = r.id;

-- keep sequence ahead of max numeric code
INSERT INTO "AppSetting" (id, key, value, "updatedAt")
SELECT
  'seq_' || substr(md5(random()::text), 1, 20),
  'propertyCodeSeq',
  COALESCE(
    (
      SELECT MAX(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::int)::text
      FROM "Property"
      WHERE code ~ '^F-[0-9]+$'
    ),
    '0'
  ),
  NOW()
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    "updatedAt" = NOW();
