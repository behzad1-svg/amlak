"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // No-op when Sentry is not configured (no DSN)
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="fa" dir="rtl">
      <body>
        <div className="p-8 text-center" role="alert">
          <div className="text-[18px] font-extrabold">خطای غیرمنتظره</div>
          <p className="mt-2 text-[13px] text-zinc-500">{error.message || "برنامه نتوانست بارگذاری شود."}</p>
          <button
            onClick={() => reset()}
            className="mt-4 rounded-[12px] bg-[#8E1E2E] px-4 py-2 text-[13.5px] font-medium text-white"
          >
            تلاش دوباره
          </button>
        </div>
      </body>
    </html>
  );
}
