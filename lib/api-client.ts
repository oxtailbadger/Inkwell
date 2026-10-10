// Client-side wrapper for calls to our own /api/* routes.
//
// Signed-out API calls now get a real `401` (the middleware answers before the
// route runs — see DECISIONS.md). Without handling, every call site would show
// its own generic "Could not …" error for what is really "your session ended".
// apiFetch turns that one status into one behaviour: send the user to /login
// with an explanation, instead of leaving them on a page whose every action
// quietly fails.

export class SessionExpiredError extends Error {
  constructor() {
    super("Your session has ended");
    this.name = "SessionExpiredError";
  }
}

// A hard navigation, deliberately — not router.push(). After a session ends
// we want a full reload so no client state or cached server render from the
// signed-in session survives. (This is also why sign-out uses it.)
// `reason` must be a code lib/auth-messages.ts knows about.
export function goToLogin(reason?: "expired"): void {
  const url = new URL("/login", window.location.origin);
  if (reason) url.searchParams.set("error", reason);
  window.location.assign(url.toString());
}

// Drop-in for fetch(). Anything other than 401 is returned untouched — callers
// still own their own handling of 4xx/5xx and network errors.
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    goToLogin("expired");
    // Callers' existing catch blocks run on this; the page is navigating away,
    // so what they display is momentary.
    throw new SessionExpiredError();
  }
  return res;
}
