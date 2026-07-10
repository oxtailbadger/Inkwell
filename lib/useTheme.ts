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

    // Keep every mounted useTheme consumer (header toggle, profile selector)
    // and any other open tab in sync: the `storage` event fires in all *other*
    // tabs of this origin when localStorage changes, so a theme change made on
    // the profile page is reflected live in a feed tab left open elsewhere,
    // not just on that tab's next refresh.
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      setThemeState(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
