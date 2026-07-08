"use client";

import { useEffect } from "react";
import Link from "next/link";
import { QuillIcon } from "@/components/QuillIcon";

// Error boundaries must be Client Components. `unstable_retry` re-renders
// the failed segment without a full page reload (Next 16.2+ convention —
// replaces the older `reset` prop).
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="bg-card rounded-card border border-card-border px-10 pt-10 pb-10 w-full max-w-sm text-center">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-paper rounded-control p-4 mb-4 border border-card-border">
            <QuillIcon className="w-16 h-16" />
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">
            Something spilled
          </h1>
          <p className="text-sm text-muted mt-2">
            That page ran into a problem loading. It's usually temporary.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => unstable_retry()}
            className="w-full bg-accent text-card rounded-control py-2.5 text-sm font-semibold hover:bg-accent-hover transition-colors"
          >
            Try again
          </button>
          <Link
            href="/feed"
            className="w-full rounded-control py-2.5 text-sm font-semibold text-muted hover:text-ink transition-colors"
          >
            Back to the feed
          </Link>
        </div>
      </div>
    </div>
  );
}
