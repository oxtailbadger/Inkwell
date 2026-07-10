"use client";

import { useTheme } from "@/lib/useTheme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      className="text-[13px] font-semibold tracking-[0.02em] text-muted bg-transparent border border-card-border rounded-control px-3.5 py-2 hover:text-ink hover:border-ink transition-colors"
    >
      {theme === "light" ? "Dark" : "Light"}
    </button>
  );
}
