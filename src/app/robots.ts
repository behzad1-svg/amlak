// نقد ۱۳ — سامانهٔ داخلی و خصوصی است؛ هیچ صفحه‌ای برای موتور جستجو باز نیست.
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
