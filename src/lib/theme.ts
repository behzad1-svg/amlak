/** تم روشن/تاریک سامانه — انتخاب کاربر در localStorage می ماند و با data-theme روی <html> اعمال می شود */
export const THEME_STORAGE_KEY = "saj-theme";

export type Theme = "light" | "dark";

/** فقط "dark" ذخیره شده یعنی تاریک؛ هر مقدار دیگر (خالی، خراب، قدیمی) یعنی روشن */
export function resolveTheme(stored: string | null | undefined): Theme {
  return stored === "dark" ? "dark" : "light";
}
