// Where to send someone after they sign in.
//
// The destination travels in a `?next=` query parameter, which anyone can write
// into a link — so it's untrusted input on every hop (middleware → login page →
// emailed link → callback → navigation). One validator, used at every hop, so a
// hop can't forget. It used to live privately in the callback route.

export const DEFAULT_AFTER_LOGIN = "/feed";

const MAX_LENGTH = 2000;
// Never a valid destination: sending someone to a sign-in page right after they
// signed in is a loop, and /api/* are JSON endpoints, not pages.
const NOT_DESTINATIONS = ["/login", "/signup", "/api"];

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isUnderPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

// True only for a same-site, relative path: starts with a single "/", can't be
// read by a browser as another host ("//evil.com", "/\evil.com"), has no
// control characters (header/log injection), isn't absurdly long, and isn't a
// sign-in or API path.
export function isSafeNextPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return false;
  if (!/^\/(?!\/|\\)/.test(value)) return false;
  if (CONTROL_CHARS.test(value)) return false;
  const pathname = value.split(/[?#]/, 1)[0];
  return !NOT_DESTINATIONS.some((base) => isUnderPath(pathname, base));
}

export function safeNextPath(value: unknown): string {
  return isSafeNextPath(value) ? value : DEFAULT_AFTER_LOGIN;
}

// Where the auth gate sends a signed-out visitor. Remembers where they were
// headed (including its query string — that's what carries a shared link from
// the Android share sheet) so signing in lands them there. Nothing is added when
// the destination is just the default, to keep the common URL clean.
export function loginRedirectPath(pathname: string, search: string): string {
  const destination = `${pathname}${search}`;
  // "/" only forwards to the default, so it isn't worth remembering either
  if (!isSafeNextPath(destination) || destination === "/" || destination === DEFAULT_AFTER_LOGIN) {
    return "/login";
  }
  return `/login?next=${encodeURIComponent(destination)}`;
}

// Where to navigate once signed in, as an absolute URL for window.location.assign
// (an absolute URL, because a relative literal trips the no-location-assign lint
// rule). An unsafe or missing `next` becomes the default.
export function afterLoginUrl(origin: string, next: unknown): string {
  return new URL(safeNextPath(next), origin).toString();
}

// The link in the sign-in email lands on /api/auth/callback; to carry the
// destination through that hop it rides along as `?next=`. Omitted when it's the
// default or isn't safe, so the common link stays clean and an unsafe value can
// never be forwarded.
export function authCallbackUrl(origin: string, next?: unknown): string {
  const base = `${origin}/api/auth/callback`;
  return isSafeNextPath(next) && next !== DEFAULT_AFTER_LOGIN
    ? `${base}?next=${encodeURIComponent(next)}`
    : base;
}

// Link between /login and /signup that keeps the destination
export function authPageHref(page: "/login" | "/signup", next?: unknown): string {
  return isSafeNextPath(next) && next !== DEFAULT_AFTER_LOGIN
    ? `${page}?next=${encodeURIComponent(next)}`
    : page;
}

