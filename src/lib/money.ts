export function formatTomanWithWords(value: string | number | bigint | null | undefined): { formatted: string; words: string } {
  if (value == null || value === "") return { formatted: "—", words: "" };
  const str = String(value).replace(/[^0-9]/g, "");
  if (!str || str === "0") return { formatted: "۰ تومان", words: "" };
  const formatted = str.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " تومان";
  const num = BigInt(str);
  const billion = num / BigInt(1_000_000_000);
  const remainderMillion = (num % BigInt(1_000_000_000)) / BigInt(1_000_000);
  let words = "";
  if (billion > 0) words += `${billion} میلیارد`;
  if (remainderMillion > 0) words += `${words ? " و " : ""}${remainderMillion} میلیون`;
  if (words) words += " تومان";
  // For small amounts under 1B, still show
  if (!words) {
    const million = num / BigInt(1_000_000);
    if (million > 0) words = `${million} میلیون تومان`;
    else words = `${str.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} تومان`;
  }
  return { formatted, words };
}

export function toPersianTomanWords(value: string | number | bigint | null | undefined): string {
  return formatTomanWithWords(value).words;
}
