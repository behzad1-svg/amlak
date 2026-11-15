-- دسته‌بندی مالک/مشتری: یک شماره می‌تواند یک بار مالک و یک بار مشتری باشد.
-- پیش‌تر ستون phone به‌تنهایی یکتا بود؛ حالا یکتایی (phone, type) است.
-- پیش از اجرا نام قید یکتای phone را بررسی کنید (پیش‌فرض Prisma: Customer_phone_key).
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_phone_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_phone_type_key" ON "Customer"("phone", "type");
