"use client";

import { useTheme } from "@/lib/useTheme";

// A pill switch rather than a status-label button — the sun/moon icons are
// fixed at each end of the track and the knob slides to whichever is
// active, so the control reads as "toggle this" at a glance instead of
// "here's the current mode" (see DECISIONS.md).
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      role="switch"
      aria-checked={isDark}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="relative inline-flex items-center shrink-0 w-12 h-6 rounded-full border border-card-border bg-card transition-colors"
    >
      <span aria-hidden="true" className="absolute left-1 text-[10px] leading-none text-muted-2 select-none">
        ☀︎
      </span>
      <span aria-hidden="true" className="absolute right-1 text-[10px] leading-none text-muted-2 select-none">
        ☾
      </span>
      {/* bg-ink deliberately flips light/dark with the theme (same token
          used for the header avatar/site-badge monograms) so the knob
          stays a dark circle on the light track and a light circle on the
          dark track, in both cases contrasting against bg-card */}
      <span
        aria-hidden="true"
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-ink shadow-sm transition-transform duration-200 ease-in-out ${
          isDark ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}
