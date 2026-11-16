/**
 * تبدیل DATABASE_URL به متغیرهای PG* برای pg_dump.
 *
 * pg_dump متغیر DATABASE_URL را نمی‌خواند — این نام قراردادی Prisma/Node است و
 * libpq فقط PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (و PGSSLMODE) را می‌خواند.
 * رمز و آدرس هرگز در آرگومان‌های پروسه قرار نمی‌گیرند تا در فهرست پروسه‌ها
 * (مثلاً خروجی `ps`) دیده نشوند.
 */
export function databaseUrlToPgEnv(dbUrl: string): Record<string, string> {
  const u = new URL(dbUrl);
  const env: Record<string, string> = {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\/+/, ""),
  };
  const sslmode = u.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}
