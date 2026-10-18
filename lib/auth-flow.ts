import { authCallbackUrl } from "@/lib/safe-redirect";

// The sign-in / sign-up flow, minus React. components/AuthForm.tsx is a thin
// shell over this file, because the repo has no DOM-testing library and the
// parts that went wrong for real users — which error means what, what to say,
// when a person can ask for another email — are logic, and logic is testable.
//
// Three rules the whole file exists to keep:
//  1. Never show a raw Supabase message. "Signups not allowed for otp" is what
//     a new friend used to see on the sign-in page; it means nothing to them.
//  2. Every dead end offers a way forward (create an account, resend, use a
//     different address, check spam).
//  3. A code can be typed from any device. The emailed *link* only works in the
//     browser that requested it (PKCE), which is what broke sign-up for people
//     who asked on one device and opened the email on another — or inside
//     Instagram's in-app browser.

export type AuthMode = "signin" | "signup";

// What we need from a Supabase auth error. Matches AuthError structurally, but
// stays a plain shape so tests can build one without importing the library.
export type AuthLikeError = {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
};

export type FailureKind =
  | "no-account" // sign-in with an email that has no account
  | "signups-closed" // sign-up attempted while new sign-ups are disabled
  | "rate-limited"
  | "invalid-email"
  | "bad-code" // wrong, mistyped, expired, or already-replaced code
  | "network" // we never reached the server (offline, blocked, dropped)
  | "server" // we reached it and it failed (e.g. the email provider is down)
  | "unknown";

export type AuthFailure = {
  kind: FailureKind;
  // Always safe to show to a person
  message: string;
  // Present for rate limits: how long until asking again can work
  retryAfterSeconds?: number;
  // Supabase's error code, kept for the "ref:" hint on unknown errors
  code?: string;
};

// Supabase allows one email per address per 60 seconds by default, so the
// Resend button waits the same; asking sooner just earns a rate-limit error.
export const RESEND_COOLDOWN_SECONDS = 60;

// Supabase lets the project choose an OTP length from 6 to 10 digits.
const CODE_PATTERN = /^\d{6,10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

// People paste "123 456" or "123-456" from the email.
export const normalizeCode = (value: string): string => value.replace(/[\s-]/g, "");

export const isPlausibleEmail = (value: string): boolean => EMAIL_PATTERN.test(value);
export const isPlausibleCode = (value: string): boolean => CODE_PATTERN.test(value);

// ── Error classification ────────────────────────────────────────────────────

const RATE_LIMIT_CODES = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "over_sms_send_rate_limit",
]);

function retryAfterFrom(message: string): number {
  // "For security purposes, you can only request this after 42 seconds."
  const m = message.match(/(\d+)\s*seconds?/i);
  const parsed = m ? Number(m[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 3600) : RESEND_COOLDOWN_SECONDS;
}

export function classifyAuthError(error: AuthLikeError, context: "send" | "verify"): AuthFailure {
  const code = error.code ?? "";
  const status = error.status;
  const message = error.message ?? "";

  if (code === "otp_disabled") {
    return {
      kind: "no-account",
      message: "We couldn't find an Inkwell account for that email.",
      code,
    };
  }

  if (code === "signup_disabled" || /signups? not allowed for this instance/i.test(message)) {
    return {
      kind: "signups-closed",
      message:
        "New sign-ups are closed right now. If a friend invited you, ask them to check in with whoever runs Inkwell.",
      code,
    };
  }

  if (RATE_LIMIT_CODES.has(code) || status === 429) {
    return {
      kind: "rate-limited",
      retryAfterSeconds: retryAfterFrom(message),
      message:
        context === "send"
          ? "You've asked for a few emails in a row. Please wait a minute before asking for another — and check your spam folder in case an earlier one landed there."
          : "That's a lot of tries in a row. Please wait a minute, then try again.",
      code,
    };
  }

  // A connection that never completed. supabase-js reports it as
  // AuthRetryableFetchError with status 0 — but it ALSO wraps every 5xx
  // response (500–504, Cloudflare's 52x) in that same class, with the body
  // unparsed so no error code survives. So the class name alone can't tell
  // "offline" from "Supabase / the email provider failed"; the status can.
  if (
    status === 0 ||
    (error.name === "AuthRetryableFetchError" && status === undefined) ||
    /failed to fetch|networkerror|network request failed/i.test(message)
  ) {
    return {
      kind: "network",
      message: "We couldn't reach Inkwell. Check your internet connection and try again.",
      code,
    };
  }

  // We reached the server and it failed — most often the email provider.
  if (status !== undefined && status >= 500) {
    const ref = ` (ref: ${code || status})`;
    return {
      kind: "server",
      message:
        context === "send"
          ? `Something went wrong on our end and we couldn't send that email. Please try again in a few minutes.${ref}`
          : `Something went wrong on our end while checking that code. Please try again in a moment.${ref}`,
      code: code || undefined,
    };
  }

  if (context === "verify") {
    if (
      code === "otp_expired" ||
      status === 400 ||
      status === 403 ||
      status === 422 ||
      /expired|invalid/i.test(message)
    ) {
      return {
        kind: "bad-code",
        message:
          "That code didn't work. Check the email address and the code for typos, or ask for a new email — each new email replaces the old code.",
        code,
      };
    }
    return {
      kind: "unknown",
      message: "We couldn't check that code right now. Please try again in a moment.",
      code,
    };
  }

  if (
    code === "email_address_invalid" ||
    code === "validation_failed" ||
    /unable to validate email|invalid format|invalid email/i.test(message)
  ) {
    return {
      kind: "invalid-email",
      message: "That doesn't look like a valid email address. Please check it and try again.",
      code,
    };
  }

  return {
    kind: "unknown",
    // The code (never the raw message) is useful when someone reports a problem
    message: `We couldn't send that email right now. Please try again in a few minutes.${
      code ? ` (ref: ${code})` : ""
    }`,
    code: code || undefined,
  };
}

const networkFailure = (): AuthFailure => ({
  kind: "network",
  message: "We couldn't reach Inkwell. Check your internet connection and try again.",
});

// ── Talking to Supabase ─────────────────────────────────────────────────────

// The slice of the Supabase client this flow uses. The real client satisfies it,
// and tests can fake it without a network.
export type AuthClient = {
  auth: {
    signInWithOtp(params: {
      email: string;
      options: { emailRedirectTo: string; shouldCreateUser: boolean };
    }): Promise<{ error: AuthLikeError | null }>;
    verifyOtp(params: {
      email: string;
      token: string;
      type: "email" | "signup";
    }): Promise<{ error: AuthLikeError | null }>;
  };
};

export type SendResult = { ok: true; email: string } | { ok: false; failure: AuthFailure };
export type VerifyResult = { ok: true } | { ok: false; failure: AuthFailure };

// Asks Supabase to email a sign-in link AND a code (the templates carry both).
// `signup` mode creates the account if the address is new; `signin` mode never
// does, so an unknown address errors with "no-account" instead.
export async function requestCode(
  client: AuthClient,
  { email, mode, origin, next }: { email: string; mode: AuthMode; origin: string; next?: string }
): Promise<SendResult> {
  const clean = normalizeEmail(email);
  if (!isPlausibleEmail(clean)) {
    return { ok: false, failure: classifyAuthError({ code: "email_address_invalid" }, "send") };
  }
  try {
    const { error } = await client.auth.signInWithOtp({
      email: clean,
      options: {
        // Carries `next` (where they were headed, e.g. a shared link) through
        // the emailed link; only when it's safe and not just the default
        emailRedirectTo: authCallbackUrl(origin, next),
        shouldCreateUser: mode === "signup",
      },
    });
    if (error) return { ok: false, failure: classifyAuthError(error, "send") };
    return { ok: true, email: clean };
  } catch {
    return { ok: false, failure: networkFailure() };
  }
}

// A brand-new account and an existing one can be verified under different OTP
// types, and which applies isn't knowable from here, so try the likelier one
// first and fall back. Wrong-type attempts don't consume the code.
export const verifyTypesFor = (mode: AuthMode): ("email" | "signup")[] =>
  mode === "signup" ? ["signup", "email"] : ["email", "signup"];

export async function verifyCode(
  client: AuthClient,
  { email, token, mode }: { email: string; token: string; mode: AuthMode }
): Promise<VerifyResult> {
  const code = normalizeCode(token);
  if (!isPlausibleCode(code)) {
    return { ok: false, failure: classifyAuthError({ code: "otp_expired" }, "verify") };
  }

  let failure: AuthFailure = networkFailure();
  for (const type of verifyTypesFor(mode)) {
    try {
      const { error } = await client.auth.verifyOtp({ email: normalizeEmail(email), token: code, type });
      if (!error) return { ok: true };
      failure = classifyAuthError(error, "verify");
    } catch {
      return { ok: false, failure: networkFailure() };
    }
    // Only a "this code isn't valid for that type" verdict justifies trying the
    // other type; a rate limit or an outage would just repeat.
    if (failure.kind !== "bad-code") break;
  }
  return { ok: false, failure };
}

// ── Screen state ────────────────────────────────────────────────────────────

// "have-code" is for someone who already has a valid code but lost the screen
// that was waiting for it (a mobile in-app browser reloaded or evicted the tab
// while they fetched it from their email app). Requesting another email would
// REPLACE their code, so this lets them type it straight in, no email sent.
export type FlowStep = "email" | "no-account" | "code" | "have-code";
export type FlowNotice = { tone: "error" | "info"; text: string };

export type FlowState = {
  step: FlowStep;
  email: string;
  // Mode of the *current* attempt. Starts as the page's mode, and becomes
  // "signup" when someone taps "Create my account" on the sign-in page.
  mode: AuthMode;
  // The page's own mode, restored by "use a different email"
  baseMode: AuthMode;
  busy: "idle" | "sending" | "verifying";
  notice: FlowNotice | null;
  // Epoch ms before which asking for another email is pointless
  resendAvailableAt: number | null;
};

export type FlowEvent =
  | { type: "send-started" }
  | { type: "send-succeeded"; email: string; mode: AuthMode; at: number; resent: boolean }
  | { type: "send-failed"; failure: AuthFailure; email: string; mode: AuthMode; at: number }
  | { type: "verify-started" }
  | { type: "verify-failed"; failure: AuthFailure }
  | { type: "change-email" }
  | { type: "have-code-opened" }
  | { type: "have-code-closed" };

export function initFlowState(mode: AuthMode): FlowState {
  return {
    step: "email",
    email: "",
    mode,
    baseMode: mode,
    busy: "idle",
    notice: null,
    resendAvailableAt: null,
  };
}

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "send-started":
      return { ...state, busy: "sending", notice: null };

    case "send-succeeded":
      return {
        ...state,
        step: "code",
        email: event.email,
        mode: event.mode,
        busy: "idle",
        notice: event.resent
          ? {
              tone: "info",
              text: "We sent a new email. Use the newest one — the old code no longer works.",
            }
          : null,
        resendAvailableAt: event.at + RESEND_COOLDOWN_SECONDS * 1000,
      };

    case "send-failed": {
      const { failure } = event;
      // Signing in with an address that has no account isn't an error to show;
      // it's the moment to offer creating one.
      if (failure.kind === "no-account" && event.mode === "signin") {
        return { ...state, step: "no-account", email: event.email, busy: "idle", notice: null };
      }
      return {
        ...state,
        busy: "idle",
        notice: { tone: "error", text: failure.message },
        resendAvailableAt:
          failure.kind === "rate-limited"
            ? event.at + (failure.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS) * 1000
            : state.resendAvailableAt,
      };
    }

    case "verify-started":
      return { ...state, busy: "verifying", notice: null };

    case "verify-failed":
      return { ...state, busy: "idle", notice: { tone: "error", text: event.failure.message } };

    // Open "I already have a code": no request is made, and any earlier message
    // (e.g. a rate limit from asking for an email) is cleared — it doesn't apply.
    case "have-code-opened":
      return { ...state, step: "have-code", busy: "idle", notice: null };

    // Both return to the email form in the page's own mode, with nothing stale.
    case "change-email":
    case "have-code-closed":
      return {
        ...state,
        step: "email",
        mode: state.baseMode,
        busy: "idle",
        notice: null,
        resendAvailableAt: null,
      };
  }
}

export function secondsLeft(resendAvailableAt: number | null, now: number): number {
  if (resendAvailableAt === null) return 0;
  return Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));
}
