"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "inkwell-theme";

type Theme = "light" | "dark";

// The theme lives *outside* React: the `data-theme` attribute on <html>, set
// synchronously before first paint by the inline script in app/layout.tsx (see
// THEME_INIT_SCRIPT) and persisted in localStorage. That's precisely the case
// useSyncExternalStore is for — the hook subscribes to that external value
// instead of copying it into component state.
//
// What this buys over the previous useState + useEffect version:
//  - Every mounted consumer (header toggle, profile selector) reads the same
//    source, so they can't disagree; before, each held its own copy and only
//    stayed in step via the DOM.
//  - No "default to light, then flip in an effect" render: during hydration
//    React uses getServerSnapshot (matching the server's markup, so no
//    mismatch warning), then immediately re-reads the real value.
//  - Cross-tab sync is part of the subscription rather than a bolt-on.

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  // Any change to the attribute — from setTheme here, or from the storage
  // handler below — notifies React.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // The `storage` event fires in every *other* tab of this origin when
  // localStorage changes, so a change made on the profile page is reflected in
  // a feed tab left open elsewhere, not just on its next refresh. (It never
  // fires in the tab that made the change; setTheme covers that tab.)
  function onStorage(e: StorageEvent) {
    if (e.key !== STORAGE_KEY) return;
    document.documentElement.setAttribute("data-theme", e.newValue === "dark" ? "dark" : "light");
  }
  window.addEventListener("storage", onStorage);

  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

// The server can't know the viewer's theme; "light" matches the <html
// data-theme="light"> it renders. The inline script has already applied the
// real theme before paint, so this is a label value, not a visible flash.
const getServerSnapshot = (): Theme => "light";

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerSnapshot);

  function setTheme(next: Theme) {
    // Changing the attribute is what notifies subscribers (MutationObserver).
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — theme just won't persist
    }
  }

  return { theme, setTheme };
}
