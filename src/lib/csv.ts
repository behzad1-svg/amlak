// خروجی CSV — خنثی‌سازی فرمول اکسل (CSV Injection) و BOM برای اکسل.
// سلولی که با = + - @ | % شروع شود، اکسل آن را فرمول اجرا می‌کند؛ با پیشوند '
// متن می‌ماند. (راهنمای OWASP برای CSV Injection)

/** یک سلول CSV با خنثی‌سازی فرمول */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[ \t\r\n]*[=+\-@|%]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

/** آرایهٔ ردیف‌ها به متن CSV با BOM */
export function toCsv(rows: string[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
