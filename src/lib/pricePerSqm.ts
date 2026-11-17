// محاسبه دوطرفه قیمت کل و قیمت هر متر.
// رشته خالی ("") یعنی «پاک کن» — وقتی یک فیلد پاک شد، فیلد مشتق‌شده هم پاک می‌شود؛
// null یعنی «دست نزن» (بدون متراژ مبنا یا عدد نامعتبر، مقدار کهنه می‌ماند).

/** قیمت هر متر از قیمت کل و متراژ مبنا */
export function calcPerMetre(total: string, baseSize: number): string | null {
  if (total === "") return "";
  if (!(baseSize > 0)) return null;
  const n = Math.round(Number(total) / baseSize);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

/** قیمت کل از قیمت هر متر و متراژ مبنا */
export function calcTotal(perMetre: string, baseSize: number): string | null {
  if (perMetre === "") return "";
  if (!(baseSize > 0)) return null;
  const n = Math.round(Number(perMetre) * baseSize);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}
