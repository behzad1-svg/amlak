-- دسته‌بندی مالک/مشتری: یک شماره می‌تواند یک بار مالک و یک بار مشتری باشد.
-- پیش‌تر ستون phone به‌تنهایی یکتا بود؛ حالا یکتایی (phone, type) است.
-- نکته: یکتایی phone در Postgres به‌صورت ایندکس یکتا بود، نه قید؛
-- پس DROP CONSTRAINT کار نکرد و این دو دستور در کنسول Neon اجرا شد (۲۰۲۶-۱۱-۱۵):
--   CREATE UNIQUE INDEX "Customer_phone_type_key" ON "Customer"("phone", "type");
--   DROP INDEX "Customer_phone_key";
-- بررسی شد: فقط ایندکس (phone, type) مانده است.
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_phone_type_key" ON "Customer"("phone", "type");
DROP INDEX IF EXISTS "Customer_phone_key";
