"use client";
import { PageError } from "@/components/ui/LoadState";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError message={error.message || "خطای غیرمنتظره رخ داد."} onRetry={reset} />;
}
