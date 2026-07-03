import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inkwell",
    short_name: "Inkwell",
    description: "Articles worth reading, shared by friends.",
    start_url: "/feed",
    display: "standalone",
    background_color: "#fffbeb",
    theme_color: "#ffffff",
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
