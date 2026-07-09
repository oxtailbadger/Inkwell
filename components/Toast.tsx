"use client";

export type ToastItem = {
  id: string;
  message: string;
  // Carried through by FeedClient to resolve Undo back to the dismissed
  // article — ToastStack itself only renders `message`.
  articleId: string;
};

// State/timers are owned by FeedClient (single consumer, no need for
// context). Positioned above the mobile bottom nav (bottom-20 lg:bottom-4,
// z-20 vs. the nav's z-10) and offset above it the same way the main
// content area already pads for it (pb-20 lg:pb-6).
export function ToastStack({
  toasts,
  onUndo,
}: {
  toasts: ToastItem[];
  onUndo: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-20 lg:bottom-4 z-20 flex flex-col items-center gap-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{ animation: "toast-in 0.22s ease" }}
          // Hardcoded, not bg-ink/text-paper: those tokens flip in dark mode
          // (--ink becomes light), which would invert this toast to a light
          // background — breaking the Undo button's hardcoded light-green
          // text (#7fcf9e) chosen specifically for contrast against an
          // always-dark toast, regardless of page theme.
          className="pointer-events-auto flex items-center gap-3.5 bg-[#17130f] text-[#fffdfa] rounded-[10px] pl-[18px] pr-3 py-3 shadow-[0_10px_30px_rgba(23,19,15,.28)] text-[13.5px] font-medium"
        >
          <span>{toast.message}</span>
          <button
            onClick={() => onUndo(toast.id)}
            // Hardcoded, not a theme token — the design spec calls for the
            // dark-mode accent tone specifically here, for contrast against
            // this toast's always-dark background regardless of page theme.
            className="text-[#7fcf9e] font-semibold text-[13px] px-1.5 py-1 hover:opacity-80 transition-opacity"
          >
            Undo
          </button>
        </div>
      ))}
    </div>
  );
}
