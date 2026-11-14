import * as Sentry from "@sentry/nextjs";

// Edge-runtime error monitoring — error monitoring only.
// Graceful degradation: when SENTRY_DSN is unset, Sentry is never initialized.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Only capture in production builds — local dev noise stays out of Sentry.
    enabled: process.env.NODE_ENV === "production",
    tracesSampleRate: 0,
    // No user identity and no HTTP bodies (they can contain customer phone numbers)
    dataCollection: { userInfo: false, httpBodies: [] },
  });
}
