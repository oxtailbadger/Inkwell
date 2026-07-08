"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "inkwell-theme";

// The actual theme is set synchronously pre-hydration by the inline script
// in app/layout.tsx (see THEME_INIT_SCRIPT) — this component just reflects
// and toggles it. Reading document.documentElement in an effect (not during
// render) avoids a server/client markup mismatch, at the cost of the label
// being briefly "Dark" on first paint even if the persisted theme is dark;
// that's a one-frame label flash, not a layout/color flash, since the
// inline script already applied the real theme before paint.
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — theme just won't persist
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      className="text-[13px] font-semibold tracking-[0.02em] text-muted bg-transparent border border-card-border rounded-control px-3.5 py-2 hover:text-ink hover:border-ink transition-colors"
    >
      {theme === "light" ? "Dark" : "Light"}
    </button>
  );
}
