import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed the middleware.ts convention to proxy.ts; the exported
// function must be named `proxy` (or be the default export). The Supabase
// session-refresh helper it delegates to keeps its old file name/export
// (lib/supabase/middleware.ts) since that's an ordinary module, not the
// framework's special file.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Every exclusion below must stay reachable without an auth redirect,
    // or the thing it serves silently breaks:
    // - _next/static, _next/image: framework asset routes
    // - favicon.ico, *.svg/png/jpg/jpeg/gif/webp: static image assets
    //   (includes app icons, the PWA icon set, and OG-fetched images)
    // - manifest.webmanifest: fetched by the browser without cookies;
    //   an auth redirect here breaks "Add to Home Screen" installability
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
