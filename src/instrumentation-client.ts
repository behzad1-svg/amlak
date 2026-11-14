import * as Sentry from "@sentry/nextjs";

// Client-side error monitoring — error monitoring only (no tracing, replay or feedback).
// Graceful degradation: when NEXT_PUBLIC_SENTRY_DSN is unset (e.g. before Sentry is
// configured), Sentry is never initialized and this file is a no-op.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Only capture in production builds — local dev noise stays out of Sentry.
    enabled: process.env.NODE_ENV === "production",
    tracesSampleRate: 0,
    // No user identity and no HTTP bodies (they can contain customer phone numbers)
    dataCollection: { userInfo: false, httpBodies: [] },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
