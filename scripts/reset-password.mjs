/**
 * ریست مستقیم پسورد کاربر از روی سرور — برای وقتی هیچ مدیری نمی‌تواند وارد شود.
 * (RUNBOOK §۴.۲ — تنها مسیر بازیابی وقتی هیچ مدیری به سامانه دسترسی ندارد.)
 *
 * اجرا (روی سرور، به‌عنوان saj، از ریشهٔ پروژه):
 *   node scripts/reset-password.mjs --phone 09170000001 --password '<رمز-تازه>'
 *   node scripts/reset-password.mjs --phone 09170000001 --password '<رمز-تازه>' --dry-run
 *
 * قوانین:
 * - شماره تماس باید ۱۱ رقم باشد؛ رمز تازه حداقل ۱۲ کاراکتر، با حداقل یک حرف
 *   لاتین و یک رقم (همان قانون src/lib/validation.ts).
 * - اسکریپت DATABASE_URL را از `.env.local` کنار پروژه می‌خواند (همان فایلی که
 *   اپ استفاده می‌کند)؛ اگر در محیط ست شده باشد، همان مقدار محیطی مقدم است.
 * - رمز با bcrypt هش می‌شود (هزینه ۱۰، مثل src/lib/auth.ts) و نشست‌های قبلی
 *   کاربر با زیادشدن tokenVersion بی‌اعتبار می‌شوند.
 * - رمز تازه هرگز در خروجی چاپ نمی‌شود؛ پسورد را فقط به خود کاربر بدهید و
 *   آن را در چت، فایل یا تاریخچهٔ شل ننویسید.
 * - با --dry-run هیچ چیزی نوشته نمی‌شود؛ فقط بررسی می‌شود که کاربر وجود دارد
 *   و رمز معتبر است.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// بارگذاری حداقلی ‎.env.local — ‏Prisma در اسکریپت خام node این فایل را
// نمی‌خواند (فقط Next.js آن را می‌خواند). فقط متغیرهایی ست می‌شوند که در
// محیط نیستند؛ مقدار محیطی همیشه مقدم است.
if (process.env.DATABASE_URL === undefined) {
  try {
    for (const line of readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch {
    console.error("خطا: DATABASE_URL در محیط نیست و .env.local هم خوانده نشد.");
    process.exit(2);
  }
  if (process.env.DATABASE_URL === undefined) {
    console.error("خطا: DATABASE_URL نه در محیط است و نه در .env.local.");
    process.exit(2);
  }
}

const args = process.argv.slice(2);

function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const phone = argValue("--phone");
const password = argValue("--password");
const dryRun = args.includes("--dry-run");

if (!phone || !password) {
  console.error("استفاده: node scripts/reset-password.mjs --phone <11 رقم> --password '<رمز-تازه>' [--dry-run]");
  process.exit(2);
}
if (!/^[0-9]{11}$/.test(phone)) {
  console.error("خطا: شماره تماس باید ۱۱ رقم باشد.");
  process.exit(2);
}
if (password.length < 12 || password.length > 100 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
  console.error("خطا: رمز عبور باید حداقل ۱۲ کاراکتر باشد و حداقل یک حرف لاتین و یک رقم داشته باشد.");
  process.exit(2);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, name: true, role: true, active: true },
  });
  if (!user) {
    console.error(`خطا: کاربری با شمارهٔ ${phone} یافت نشد.`);
    process.exit(1);
  }
  if (!user.active) {
    console.error(`خطا: کاربر «${user.name}» غیرفعال است؛ اول از /users فعالش کنید.`);
    process.exit(1);
  }
  if (dryRun) {
    console.log(`dry-run: کاربر «${user.name}» (${user.role}) پیدا شد؛ رمز معتبر است و چیزی نوشته نشد.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    console.log(`انجام شد: پسورد کاربر «${user.name}» (${user.role}) ریست شد و نشست‌های قبلی او بی‌اعتبار شدند.`);
  }
} finally {
  await prisma.$disconnect();
}
