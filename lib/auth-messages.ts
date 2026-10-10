// Maps the `?error=` codes the login page can be sent with to user-facing text.
//
// Only known codes resolve to anything. The query string is attacker-
// controllable, so arbitrary text must never be reflected into the page — an
// unrecognised code is simply ignored.
const NOTICES = new Map<string, string>([
  [
    // Set by /api/auth/callback when exchangeCodeForSession fails. The usual
    // cause is PKCE: the verifier lives in the browser that *requested* the
    // link, so a link opened on another device/browser can't complete — e.g.
    // signing up on a laptop and tapping the email on a phone.
    "auth",
    "That sign-in link didn't work. Links only work in the same browser you requested them from, and they expire quickly. Request a new one below and open it on this device.",
  ],
  [
    // Set by lib/api-client.ts when an API call comes back 401.
    "expired",
    "Your session ended. Please sign in again.",
  ],
]);

export function authNotice(code: string | string[] | undefined): string | null {
  if (typeof code !== "string") return null;
  return NOTICES.get(code) ?? null;
}
