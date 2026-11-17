"use client";

import { useEffect } from "react";

// ثبت Service Worker فقط در پروداکشن؛ در dev کش کردن دارایی ها گمراه کننده است.
// ثبت نشدن SW نصب پذیری را خراب نمی کند، پس خطا ساکت رد می شود.
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
