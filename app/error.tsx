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
    <div className="min-h-screen flex items-center justify-center bg-amber-50 px-4">
      <div className="bg-white rounded-2xl shadow-md border border-amber-100 px-10 pt-10 pb-10 w-full max-w-sm text-center">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-amber-50 rounded-2xl p-4 mb-4 shadow-inner border border-amber-100">
            <QuillIcon className="w-16 h-16" />
          </div>
          <h1
            className="text-2xl font-semibold text-slate-900"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Something spilled
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            That page ran into a problem loading. It's usually temporary.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => unstable_retry()}
            className="w-full bg-amber-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-800 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/feed"
            className="w-full rounded-lg py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Back to the feed
          </Link>
        </div>
      </div>
    </div>
  );
}
