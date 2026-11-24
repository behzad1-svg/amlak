import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  // CSP اینجا نیست — nonce-based و برای هر درخواست در src/proxy.ts ساخته می‌شود
  // (هدر استاتیک نمی‌تواند nonce تازه داشته باشد).
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // inlineCss خاموش است تا CSP بتواند style-src را بدون 'unsafe-inline' ببندد
  // (ممیزی امنیتی ۲ آذر): استایل به‌صورت فایل جداگانه می‌آید و در بازدیدهای بعدی
  // از کش خوانده می‌شود؛ هزینه‌اش یک درخواست مسدودکننده رندر در اولین لود است
  // (لایت‌هاوس: render-blocking CSS ~۲۸۰ms موبایل).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Source-map upload only happens when SENTRY_AUTH_TOKEN (and org/project) are set;
// without them the build behaves exactly as before.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});
