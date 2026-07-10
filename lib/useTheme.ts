"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "inkwell-theme";

// Shared by ThemeToggle (header) and the profile page's theme selector — the
// actual theme is set synchronously pre-hydration by the inline script in
// app/layout.tsx (see THEME_INIT_SCRIPT); this hook just reflects and writes
// it. Reading document.documentElement in an effect (not during render)
// avoids a server/client markup mismatch, at the cost of the reported value
// briefly defaulting to "light" on first paint even if the persisted theme
// is dark; that's a one-frame label flash, not a layout/color flash, since
// the inline script already applied the real theme before paint.
export function useTheme() {
  const [theme, setThemeState] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setThemeState(current === "dark" ? "dark" : "light");
  }, []);

  function setTheme(next: "light" | "dark") {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — theme just won't persist
    }
  }

  return { theme, setTheme };
}
