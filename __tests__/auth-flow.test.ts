import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RESEND_COOLDOWN_SECONDS,
  classifyAuthError,
  flowReducer,
  initFlowState,
  isPlausibleCode,
  isPlausibleEmail,
  normalizeCode,
  normalizeEmail,
  requestCode,
  secondsLeft,
  verifyCode,
  verifyTypesFor,
  type AuthClient,
  type AuthFailure,
  type AuthLikeError,
  type FlowEvent,
  type FlowState,
} from "@/lib/auth-flow";

// What Supabase actually returns, captured from the live project (the first
// from a real request on 2026-10-16) or taken from supabase-js's error codes.
const SUPABASE = {
  signinUnknownEmail: { status: 422, code: "otp_disabled", message: "Signups not allowed for otp" },
  signupsClosed: { status: 422, code: "signup_disabled", message: "Signups not allowed for this instance" },
  cooldown: {
    status: 429,
    code: "over_email_send_rate_limit",
    message: "For security purposes, you can only request this after 42 seconds.",
  },
  badCode: { status: 403, code: "otp_expired", message: "Token has expired or is invalid" },
  badFormat: { status: 422, code: "email_address_invalid", message: "Unable to validate email address: invalid format" },
  network: { status: 0, name: "AuthRetryableFetchError", message: "Failed to fetch" },
  // supabase-js wraps every 5xx as AuthRetryableFetchError and never parses the
  // body, so a real email-provider failure arrives with a status and NO code
  smtpDown: { name: "AuthRetryableFetchError", status: 500, message: "{}" },
} satisfies Record<string, AuthLikeError>;

// Fake of the slice of the Supabase client the flow uses
function fakeClient(opts: {
  signIn?: (p: Parameters<AuthClient["auth"]["signInWithOtp"]>[0]) => AuthLikeError | null;
  verify?: (p: Parameters<AuthClient["auth"]["verifyOtp"]>[0]) => AuthLikeError | null;
} = {}) {
  const signInWithOtp = vi.fn(async (p: Parameters<AuthClient["auth"]["signInWithOtp"]>[0]) => ({
    error: opts.signIn ? opts.signIn(p) : null,
  }));
  const verifyOtp = vi.fn(async (p: Parameters<AuthClient["auth"]["verifyOtp"]>[0]) => ({
    error: opts.verify ? opts.verify(p) : null,
  }));
  return { client: { auth: { signInWithOtp, verifyOtp } } as AuthClient, signInWithOtp, verifyOtp };
}

describe("classifyAuthError", () => {
  it("turns the sign-in-with-no-account error into 'no-account', never the raw text", () => {
    const f = classifyAuthError(SUPABASE.signinUnknownEmail, "send");
    expect(f.kind).toBe("no-account");
    expect(f.message).not.toMatch(/otp/i);
  });

  it("explains closed sign-ups", () => {
    const f = classifyAuthError(SUPABASE.signupsClosed, "send");
    expect(f.kind).toBe("signups-closed");
    expect(f.message).toMatch(/closed/i);
  });

  it("recognizes the 60-second cooldown and reads the wait from Supabase's message", () => {
    const f = classifyAuthError(SUPABASE.cooldown, "send");
    expect(f.kind).toBe("rate-limited");
    expect(f.retryAfterSeconds).toBe(42);
    expect(f.message).toMatch(/spam/i); // the earlier email may have been filed there
  });

  it("falls back to the default wait when a rate limit gives no number, and clamps absurd ones", () => {
    expect(classifyAuthError({ status: 429 }, "send").retryAfterSeconds).toBe(RESEND_COOLDOWN_SECONDS);
    expect(
      classifyAuthError({ code: "over_request_rate_limit", message: "wait 999999 seconds" }, "send")
        .retryAfterSeconds
    ).toBe(3600);
  });

  it("a rate-limited code attempt says 'too many tries', not 'ask for another email'", () => {
    const f = classifyAuthError(SUPABASE.cooldown, "verify");
    expect(f.kind).toBe("rate-limited");
    expect(f.message).toMatch(/tries/i);
  });

  it("recognizes a bad or expired code, and tells people each email replaces the last", () => {
    const f = classifyAuthError(SUPABASE.badCode, "verify");
    expect(f.kind).toBe("bad-code");
    expect(f.message).toMatch(/new email/i);
    // On the "I already have a code" screen a wrong ADDRESS fails exactly like a
    // wrong code, so the message has to point at both
    expect(f.message).toMatch(/email address/i);
    expect(f.message).not.toMatch(/below/i); // not every screen that shows it has anything "below"
  });

  it("recognizes an invalid address", () => {
    expect(classifyAuthError(SUPABASE.badFormat, "send").kind).toBe("invalid-email");
  });

  it.each([
    ["a dropped connection (status 0)", SUPABASE.network],
    ["a bare 'Failed to fetch'", { message: "Failed to fetch" }],
    ["a retryable fetch error with no status", { name: "AuthRetryableFetchError", message: "x" }],
  ])("recognizes %s as 'can't reach us'", (_label, err) => {
    expect(classifyAuthError(err, "send").kind).toBe("network");
    expect(classifyAuthError(err, "verify").kind).toBe("network");
  });

  // The regression behind this block: supabase-js hands back an email-provider
  // failure under the same error CLASS as a dropped connection, and telling a
  // person to "check your internet" when the problem is on our side is wrong
  // and sends them off debugging the wrong thing.
  it.each([
    ["an email-provider failure (500)", SUPABASE.smtpDown],
    ["a bad gateway (502)", { name: "AuthRetryableFetchError", status: 502, message: "{}" }],
    ["a gateway timeout (504)", { name: "AuthRetryableFetchError", status: 504, message: "{}" }],
    ["a Cloudflare 522", { name: "AuthRetryableFetchError", status: 522, message: "{}" }],
  ])("recognizes %s as a problem on our side, NOT the person's connection", (_label, err) => {
    for (const context of ["send", "verify"] as const) {
      const f = classifyAuthError(err, context);
      expect(f.kind).toBe("server");
      expect(f.message).not.toMatch(/internet|connection/i);
      expect(f.message).toMatch(/our end/i);
      expect(f.message).toContain(`${err.status}`); // a reference to quote when reporting it
    }
  });

  it("shows a generic message with a reference code for anything else it doesn't recognize", () => {
    const f = classifyAuthError({ status: 400, code: "some_new_error", message: "Weird new thing" }, "send");
    expect(f.kind).toBe("unknown");
    expect(f.message).toContain("some_new_error");
    expect(f.message).not.toMatch(/weird new thing/i);
  });

  // The invariant behind all of the above: raw server wording never reaches a person.
  it.each(Object.entries(SUPABASE))("never echoes Supabase's own wording (%s)", (_name, err) => {
    for (const context of ["send", "verify"] as const) {
      const shown = classifyAuthError(err, context).message.toLowerCase();
      const raw = (err.message ?? "").toLowerCase();
      expect(shown).not.toContain(raw);
    }
  });
});

describe("input normalization", () => {
  it("trims and lowercases email", () => {
    expect(normalizeEmail("  Friend@Example.COM ")).toBe("friend@example.com");
  });

  it.each([
    ["123456", "123456"],
    ["123 456", "123456"],
    ["123-456", "123456"],
    [" 123456\n", "123456"],
  ])("normalizes the code %j", (input, expected) => {
    expect(normalizeCode(input)).toBe(expected);
  });

  it.each(["123456", "12345678", "1234567890"])("accepts a %s-style code (6–10 digits)", (c) => {
    expect(isPlausibleCode(c)).toBe(true);
  });
  it.each(["", "12345", "12345678901", "12a456", "abcdef"])("rejects %j as a code", (c) => {
    expect(isPlausibleCode(c)).toBe(false);
  });

  it.each([
    ["a@b.co", true],
    ["first.last+tag@sub.example.com", true],
    ["no-at-sign.com", false],
    ["two@@example.com", false],
    ["spaces in@example.com", false],
    ["missing@tld", false],
  ])("isPlausibleEmail(%j) = %s", (value, expected) => {
    expect(isPlausibleEmail(value)).toBe(expected);
  });
});

describe("requestCode", () => {
  it("sign-in mode never creates an account; sign-up mode does", async () => {
    const a = fakeClient();
    await requestCode(a.client, { email: "a@b.co", mode: "signin", origin: "https://x.test" });
    expect(a.signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false);

    const b = fakeClient();
    await requestCode(b.client, { email: "a@b.co", mode: "signup", origin: "https://x.test" });
    expect(b.signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(true);
  });

  it("redirects links back to the origin the person is on (so .xyz stays .xyz)", async () => {
    const { client, signInWithOtp } = fakeClient();
    await requestCode(client, { email: "a@b.co", mode: "signup", origin: "https://inkwell-reads.xyz" });
    expect(signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(
      "https://inkwell-reads.xyz/api/auth/callback"
    );
  });

  it("sends the cleaned-up address and returns it", async () => {
    const { client, signInWithOtp } = fakeClient();
    const r = await requestCode(client, { email: "  Friend@Example.com ", mode: "signup", origin: "https://x.test" });
    expect(signInWithOtp.mock.calls[0][0].email).toBe("friend@example.com");
    expect(r).toEqual({ ok: true, email: "friend@example.com" });
  });

  it("rejects an implausible address locally without calling Supabase", async () => {
    const { client, signInWithOtp } = fakeClient();
    const r = await requestCode(client, { email: "not-an-email", mode: "signin", origin: "https://x.test" });
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, failure: { kind: "invalid-email" } });
  });

  it("reports an unknown sign-in address as 'no-account' (the new-friend case)", async () => {
    const { client } = fakeClient({ signIn: () => SUPABASE.signinUnknownEmail });
    const r = await requestCode(client, { email: "new@friend.com", mode: "signin", origin: "https://x.test" });
    expect(r).toMatchObject({ ok: false, failure: { kind: "no-account" } });
  });

  it("turns a thrown network error into a friendly failure rather than an exception", async () => {
    const client = {
      auth: {
        signInWithOtp: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
        verifyOtp: vi.fn(),
      },
    } as unknown as AuthClient;
    const r = await requestCode(client, { email: "a@b.co", mode: "signin", origin: "https://x.test" });
    expect(r).toMatchObject({ ok: false, failure: { kind: "network" } });
  });
});

describe("verifyCode", () => {
  it("tries the likelier OTP type first: 'signup' for a new account, 'email' for sign-in", () => {
    expect(verifyTypesFor("signup")).toEqual(["signup", "email"]);
    expect(verifyTypesFor("signin")).toEqual(["email", "signup"]);
  });

  it("succeeds on the first type that accepts the code, and stops", async () => {
    const { client, verifyOtp } = fakeClient();
    const r = await verifyCode(client, { email: "A@b.co", token: "123 456", mode: "signin" });
    expect(r).toEqual({ ok: true });
    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({ email: "a@b.co", token: "123456", type: "email" });
  });

  it("falls back to the other type when the first says the code isn't valid for it", async () => {
    // A new account's code verifies under 'signup', not 'email'
    const { client, verifyOtp } = fakeClient({ verify: (p) => (p.type === "signup" ? null : SUPABASE.badCode) });
    const r = await verifyCode(client, { email: "a@b.co", token: "123456", mode: "signin" });
    expect(r).toEqual({ ok: true });
    expect(verifyOtp.mock.calls.map((c) => c[0].type)).toEqual(["email", "signup"]);
  });

  it("reports a bad code only after both types have said no", async () => {
    const { client, verifyOtp } = fakeClient({ verify: () => SUPABASE.badCode });
    const r = await verifyCode(client, { email: "a@b.co", token: "123456", mode: "signup" });
    expect(r).toMatchObject({ ok: false, failure: { kind: "bad-code" } });
    expect(verifyOtp).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry the other type after a rate limit or an outage (it would just repeat)", async () => {
    for (const err of [SUPABASE.cooldown, SUPABASE.network]) {
      const { client, verifyOtp } = fakeClient({ verify: () => err });
      const r = await verifyCode(client, { email: "a@b.co", token: "123456", mode: "signin" });
      expect(r.ok).toBe(false);
      expect(verifyOtp).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects a malformed code locally without calling Supabase", async () => {
    const { client, verifyOtp } = fakeClient();
    for (const token of ["", "123", "abcdef"]) {
      const r = await verifyCode(client, { email: "a@b.co", token, mode: "signin" });
      expect(r).toMatchObject({ ok: false, failure: { kind: "bad-code" } });
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("flow state", () => {
  const T0 = 1_000_000;
  const run = (state: FlowState, ...events: FlowEvent[]) => events.reduce(flowReducer, state);
  const failure = (f: Partial<AuthFailure> & Pick<AuthFailure, "kind" | "message">): AuthFailure => f;

  it("starts on the email step in the page's mode", () => {
    expect(initFlowState("signin")).toMatchObject({ step: "email", mode: "signin", baseMode: "signin", busy: "idle" });
    expect(initFlowState("signup")).toMatchObject({ mode: "signup", baseMode: "signup" });
  });

  it("happy path: send → code screen, with the resend cooldown started", () => {
    const s = run(
      initFlowState("signup"),
      { type: "send-started" },
      { type: "send-succeeded", email: "a@b.co", mode: "signup", at: T0, resent: false }
    );
    expect(s).toMatchObject({ step: "code", email: "a@b.co", mode: "signup", busy: "idle", notice: null });
    expect(s.resendAvailableAt).toBe(T0 + RESEND_COOLDOWN_SECONDS * 1000);
  });

  describe("the forgiving sign-in path (an unknown address on /login)", () => {
    const afterUnknown = run(
      initFlowState("signin"),
      { type: "send-started" },
      {
        type: "send-failed",
        failure: failure({ kind: "no-account", message: "x" }),
        email: "new@friend.com",
        mode: "signin",
        at: T0,
      }
    );

    it("lands on a 'create an account' step instead of showing an error", () => {
      expect(afterUnknown).toMatchObject({ step: "no-account", email: "new@friend.com", busy: "idle", notice: null });
    });

    it("creating the account moves to the code screen in SIGN-UP mode (so the right code type is tried first)", () => {
      const s = run(
        afterUnknown,
        { type: "send-started" },
        { type: "send-succeeded", email: "new@friend.com", mode: "signup", at: T0 + 1000, resent: false }
      );
      expect(s).toMatchObject({ step: "code", mode: "signup", baseMode: "signin" });
    });

    it("'use a different email' returns to the email step in the page's original mode", () => {
      const s = run(afterUnknown, { type: "change-email" });
      expect(s).toMatchObject({ step: "email", mode: "signin", notice: null });
    });

    it("if sign-ups are closed, stays put and says so (no dead end, no raw error)", () => {
      const s = run(afterUnknown, {
        type: "send-failed",
        failure: failure({ kind: "signups-closed", message: "New sign-ups are closed right now." }),
        email: "new@friend.com",
        mode: "signup",
        at: T0,
      });
      expect(s.step).toBe("no-account");
      expect(s.notice).toEqual({ tone: "error", text: "New sign-ups are closed right now." });
    });
  });

  it("'no-account' only applies to sign-in; a sign-up attempt with that failure stays on its screen", () => {
    const s = run(initFlowState("signup"), {
      type: "send-failed",
      failure: failure({ kind: "no-account", message: "m" }),
      email: "a@b.co",
      mode: "signup",
      at: T0,
    });
    expect(s.step).toBe("email");
    expect(s.notice?.tone).toBe("error");
  });

  describe("resend", () => {
    const onCode = run(
      initFlowState("signup"),
      { type: "send-succeeded", email: "a@b.co", mode: "signup", at: T0, resent: false }
    );

    it("a successful resend restarts the cooldown and tells people to use the newest email", () => {
      const s = run(onCode, { type: "send-started" }, { type: "send-succeeded", email: "a@b.co", mode: "signup", at: T0 + 70_000, resent: true });
      expect(s.step).toBe("code");
      expect(s.notice).toMatchObject({ tone: "info" });
      expect(s.notice?.text).toMatch(/newest/i);
      expect(s.resendAvailableAt).toBe(T0 + 70_000 + RESEND_COOLDOWN_SECONDS * 1000);
    });

    it("a rate-limited resend keeps the code screen and waits the time Supabase asked for", () => {
      const s = run(onCode, {
        type: "send-failed",
        failure: failure({ kind: "rate-limited", message: "slow down", retryAfterSeconds: 17 }),
        email: "a@b.co",
        mode: "signup",
        at: T0 + 5000,
      });
      expect(s.step).toBe("code");
      expect(s.notice).toEqual({ tone: "error", text: "slow down" });
      expect(s.resendAvailableAt).toBe(T0 + 5000 + 17_000);
    });

    it("a failed resend for another reason leaves the existing cooldown alone", () => {
      const s = run(onCode, {
        type: "send-failed",
        failure: failure({ kind: "network", message: "offline" }),
        email: "a@b.co",
        mode: "signup",
        at: T0 + 5000,
      });
      expect(s.resendAvailableAt).toBe(onCode.resendAvailableAt);
    });
  });

  it("a wrong code shows a message and stays on the code screen, ready to retry", () => {
    const onCode = run(initFlowState("signin"), { type: "send-succeeded", email: "a@b.co", mode: "signin", at: T0, resent: false });
    const s = run(
      onCode,
      { type: "verify-started" },
      { type: "verify-failed", failure: failure({ kind: "bad-code", message: "That code didn't work." }) }
    );
    expect(s).toMatchObject({ step: "code", busy: "idle" });
    expect(s.notice).toEqual({ tone: "error", text: "That code didn't work." });
  });

  it("verify-started clears any earlier message", () => {
    const withNotice: FlowState = { ...initFlowState("signin"), step: "code", notice: { tone: "error", text: "old" } };
    expect(run(withNotice, { type: "verify-started" })).toMatchObject({ busy: "verifying", notice: null });
  });

  describe('"I already have a code" (a code in the inbox, but the screen waiting for it is gone)', () => {
    const fresh = initFlowState("signin");

    it("opens from the email form without sending anything", () => {
      const s = run(fresh, { type: "have-code-opened" });
      expect(s).toMatchObject({ step: "have-code", busy: "idle", notice: null });
      // the reducer has no way to send; the component only dispatches this event
      // — what matters is that it doesn't ask for an email (see the AuthForm guard)
      expect(s.resendAvailableAt).toBeNull();
    });

    it("clears an earlier message that no longer applies (e.g. a rate limit from asking for an email)", () => {
      const withError: FlowState = { ...fresh, notice: { tone: "error", text: "slow down" } };
      expect(run(withError, { type: "have-code-opened" }).notice).toBeNull();
    });

    it("a wrong code or address shows a message and stays on this screen, ready to retry", () => {
      const s = run(
        fresh,
        { type: "have-code-opened" },
        { type: "verify-started" },
        { type: "verify-failed", failure: failure({ kind: "bad-code", message: "That code didn't work." }) }
      );
      expect(s).toMatchObject({ step: "have-code", busy: "idle" });
      expect(s.notice).toEqual({ tone: "error", text: "That code didn't work." });
    });

    it("verify-started clears the previous error while checking", () => {
      const failed = run(
        fresh,
        { type: "have-code-opened" },
        { type: "verify-failed", failure: failure({ kind: "bad-code", message: "nope" }) }
      );
      expect(run(failed, { type: "verify-started" })).toMatchObject({ step: "have-code", busy: "verifying", notice: null });
    });

    it("'Email me a new one' goes back to the email form in the page's own mode, with nothing stale", () => {
      const signupPage = initFlowState("signup");
      const s = run(
        signupPage,
        { type: "have-code-opened" },
        { type: "verify-failed", failure: failure({ kind: "bad-code", message: "nope" }) },
        { type: "have-code-closed" }
      );
      expect(s).toMatchObject({ step: "email", mode: "signup", baseMode: "signup", busy: "idle", notice: null, resendAvailableAt: null });
    });

    it("works from either page, and leaves the page's mode untouched", () => {
      for (const page of ["signin", "signup"] as const) {
        expect(run(initFlowState(page), { type: "have-code-opened" })).toMatchObject({ baseMode: page, mode: page });
      }
    });

    it("verifying from here tries both OTP types, ordered by the page's mode (no email is requested)", async () => {
      // The component passes the page's mode; verifyCode itself never calls signInWithOtp
      for (const [page, order] of [["signin", ["email", "signup"]], ["signup", ["signup", "email"]]] as const) {
        const { client, signInWithOtp, verifyOtp } = fakeClient({ verify: () => SUPABASE.badCode });
        await verifyCode(client, { email: "a@b.co", token: "123456", mode: page });
        expect(verifyOtp.mock.calls.map((c) => c[0].type)).toEqual(order);
        expect(signInWithOtp).not.toHaveBeenCalled();
      }
    });
  });

  it("'use a different email' from the code screen clears the cooldown and returns to the page's own mode", () => {
    const s = run(
      initFlowState("signin"),
      { type: "send-succeeded", email: "a@b.co", mode: "signup", at: T0, resent: false },
      { type: "change-email" }
    );
    expect(s).toMatchObject({ step: "email", mode: "signin", resendAvailableAt: null, notice: null });
  });
});

describe("secondsLeft (the resend countdown)", () => {
  it("is 0 when there's no cooldown", () => {
    expect(secondsLeft(null, 5)).toBe(0);
  });
  it("rounds partial seconds up, so the button never says 0s while still disabled", () => {
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 9_000)).toBe(1);
    expect(secondsLeft(10_000, 4_000)).toBe(6);
  });
  it("never goes negative once the time has passed", () => {
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    expect(secondsLeft(10_000, 99_000)).toBe(0);
  });
});

// The component has no DOM test (the repo doesn't use one), so pin the one rule
// it must never break by source: it must not display a raw error message.
describe("AuthForm source guard", () => {
  const src = readFileSync(join(process.cwd(), "components", "AuthForm.tsx"), "utf8");

  it("never renders error.message (use lib/auth-flow.ts so people see friendly text)", () => {
    expect(src).not.toMatch(/\berror\.message\b/);
    expect(src).not.toMatch(/\bsetError\(/);
  });

  it("offers 'Already have a code?' on the email form, and that path never requests an email", () => {
    expect(src).toMatch(/Already have a code\?/);
    // handleHaveCodeSubmit must verify only: asking for another email would
    // REPLACE the very code the person is trying to use
    const handler = src.slice(src.indexOf("function handleHaveCodeSubmit"));
    const body = handler.slice(0, handler.indexOf("\n  }\n"));
    expect(body).toMatch(/submitCode\(/);
    expect(body).not.toMatch(/send\(|requestCode\(/);
  });

  it("goes through requestCode / verifyCode rather than calling Supabase directly", () => {
    expect(src).toMatch(/requestCode\(/);
    expect(src).toMatch(/verifyCode\(/);
    expect(src).not.toMatch(/signInWithOtp\(/);
    expect(src).not.toMatch(/verifyOtp\(/);
  });
});
