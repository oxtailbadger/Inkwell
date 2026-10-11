import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inkwell",
    short_name: "Inkwell",
    description: "Articles worth reading, shared by friends.",
    start_url: "/feed",
    display: "standalone",
    // The manifest is static, so it can't follow the user's light/dark choice —
    // both use the light Broadsheet paper color (--paper in app/globals.css),
    // which is also the background of the launcher icons, so the splash screen
    // and icon read as one surface. __tests__/manifest.test.ts pins this to the
    // CSS token; these were left on the pre-Broadsheet amber/white until
    // 2026-10-10.
    background_color: "#f7f5f0",
    theme_color: "#f7f5f0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android system share sheet target (installed PWA only; iOS does not
    // support share_target — see the iOS Shortcut notes in BACKLOG.md)
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
