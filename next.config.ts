import type { NextConfig } from "next";

// Baseline response headers for every route (pages and /api alike).
//
// Deliberately NOT here:
//  - Strict-Transport-Security: Vercel sets HSTS itself on its domains and on
//    custom domains; a second, conflicting value from the app only risks
//    drifting. Add it here if this ever moves off Vercel.
//  - Content-Security-Policy: needs real design — article images are
//    hot-linked from arbitrary hosts (img-src) and layout.tsx has an inline
//    theme script (needs a nonce or hash). Tracked in BACKLOG.md.
const securityHeaders = [
  // Don't let the browser guess a response's type from its content.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nothing here is meant to be framed; this closes clickjacking on the
  // sign-in and share forms. (CSP frame-ancestors is the modern equivalent and
  // comes with the CSP work; this covers older browsers in the meantime.)
  { key: "X-Frame-Options", value: "DENY" },
  // Cross-origin requests (article images, outbound links) learn which site
  // the visitor came from, not which page or query string.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses none of these; deny them so an injected script couldn't
  // prompt for them either.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework (and version family) on every response.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
