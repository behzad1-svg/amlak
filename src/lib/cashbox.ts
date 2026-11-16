/**
 * موجودی صندوق از جمع کل جدول (groupBy) — نه فقط ۲۰۰ ردیف آخر فهرست.
 * groupBy برای نوعی که هیچ ردیفی ندارد سطری برنمی‌گرداند، پس جمع هر نوع
 * با ?? صفر پیش‌فرض می‌گیرد.
 */
export function cashboxBalanceFromTotals(
  totals: { type: string; _sum: { amount: bigint | null } }[]
): bigint {
  let balance = BigInt(0);
  for (const row of totals) {
    const sum = row._sum.amount ?? BigInt(0);
    balance += row.type === "IN" ? sum : -sum;
  }
  return balance;
}
