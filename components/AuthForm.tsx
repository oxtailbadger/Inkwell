"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { QuillIcon } from "@/components/QuillIcon";
import {
  flowReducer,
  initFlowState,
  normalizeCode,
  isPlausibleCode,
  requestCode,
  secondsLeft,
  verifyCode,
  type AuthMode,
} from "@/lib/auth-flow";

// Shared by the /login (signin) and /signup routes. The only differences are
// copy and whether an unknown address is allowed to create an account; all the
// behaviour (errors, resend, the code screen) lives in lib/auth-flow.ts, where
// it's tested. This component must never render a raw Supabase message.
export function AuthForm({
  mode,
  notice,
}: {
  mode: AuthMode;
  // Why the user is seeing this page again (e.g. their link failed or their
  // session ended). Already mapped to safe text by lib/auth-messages.ts.
  notice?: string | null;
}) {
  const [state, dispatch] = useReducer(flowReducer, mode, initFlowState);
  const [emailInput, setEmailInput] = useState("");
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const codeRef = useRef<HTMLInputElement>(null);

  const waitSeconds = secondsLeft(state.resendAvailableAt, now);
  const counting = state.resendAvailableAt !== null && waitSeconds > 0;

  // Tick once a second only while a countdown is running
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [counting]);

  // Move focus to the code field when the code screen appears
  useEffect(() => {
    if (state.step === "code") codeRef.current?.focus();
  }, [state.step]);

  async function send(email: string, sendMode: AuthMode, resent = false) {
    dispatch({ type: "send-started" });
    const result = await requestCode(createClient(), {
      email,
      mode: sendMode,
      origin: window.location.origin,
    });
    const at = Date.now();
    setNow(at);
    if (result.ok) {
      setCode("");
      dispatch({ type: "send-succeeded", email: result.email, mode: sendMode, at, resent });
    } else {
      dispatch({ type: "send-failed", failure: result.failure, email, mode: sendMode, at });
    }
  }

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(emailInput, state.mode);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    dispatch({ type: "verify-started" });
    const result = await verifyCode(createClient(), { email: state.email, token: code, mode: state.mode });
    if (result.ok) {
      // Hard navigation so the server sees the new session cookies. An absolute
      // URL, because a relative literal trips the no-location-assign lint rule.
      // Stay in the "verifying" state — the page is about to be replaced.
      window.location.assign(new URL("/feed", window.location.origin).toString());
    } else {
      dispatch({ type: "verify-failed", failure: result.failure });
    }
  }

  const sending = state.busy === "sending";
  const verifying = state.busy === "verifying";
  const isSignup = state.mode === "signup";
  const codeReady = isPlausibleCode(normalizeCode(code));

  const inputClass =
    "w-full rounded-control border border-card-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:outline-none focus:border-accent";
  const primaryButton =
    "w-full bg-accent text-card rounded-control py-2.5 text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors";
  const linkButton = "text-accent font-medium hover:underline disabled:opacity-50 disabled:no-underline";

  const noticeBox = state.notice && (
    <p
      role={state.notice.tone === "error" ? "alert" : "status"}
      className={`text-sm ${state.notice.tone === "error" ? "text-danger" : "text-accent"}`}
    >
      {state.notice.text}
    </p>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="bg-card rounded-card border border-card-border px-10 pt-10 pb-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-paper rounded-control p-4 mb-4 border border-card-border">
            <QuillIcon className="w-16 h-16" />
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">Inkwell</h1>
          <p className="text-sm font-display text-muted-2 mt-1 text-center">
            Articles worth reading, shared by friends.
          </p>
        </div>

        {/* Step 1 — enter your email */}
        {state.step === "email" && (
          <>
            {notice && (
              <div
                role="alert"
                className="mb-5 rounded-control bg-danger-tint border border-danger-border px-4 py-3 text-sm text-danger"
              >
                {notice}
              </div>
            )}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
              {noticeBox}
              <button type="submit" disabled={sending} className={primaryButton}>
                {sending ? "Sending…" : isSignup ? "Create my account" : "Email me a sign-in code"}
              </button>

              <p className="text-sm text-muted text-center pt-1">
                {state.baseMode === "signup" ? (
                  <>
                    Already have an account?{" "}
                    <Link href="/login" className="text-accent font-medium hover:underline">
                      Sign in
                    </Link>
                  </>
                ) : (
                  <>
                    New to Inkwell?{" "}
                    <Link href="/signup" className="text-accent font-medium hover:underline">
                      Create an account
                    </Link>
                  </>
                )}
              </p>
            </form>
          </>
        )}

        {/* Sign-in with an address that has no account: offer the way forward
            instead of an error */}
        {state.step === "no-account" && (
          <div className="space-y-4">
            <div className="rounded-control bg-paper border border-card-border px-4 py-4">
              <p className="font-semibold text-ink">We don&apos;t have an account for</p>
              <p className="font-semibold text-ink break-words">{state.email}</p>
              <p className="text-sm text-muted mt-2">
                Inkwell is a small group of friends sharing articles worth reading. You can create an
                account with this address in one step &mdash; we&apos;ll email you a code to confirm it.
              </p>
            </div>
            {noticeBox}
            <button
              type="button"
              disabled={sending}
              onClick={() => void send(state.email, "signup")}
              className={primaryButton}
            >
              {sending ? "Sending…" : "Create my account"}
            </button>
            <p className="text-sm text-muted text-center">
              Typo?{" "}
              <button type="button" onClick={() => dispatch({ type: "change-email" })} className={linkButton}>
                Use a different email
              </button>
            </p>
          </div>
        )}

        {/* Step 2 — type the code from the email */}
        {state.step === "code" && (
          <div>
            <div className="text-center">
              <div className="text-4xl mb-3">📬</div>
              <p className="font-semibold text-ink">Check your inbox</p>
              <p className="text-sm text-muted mt-1">
                We sent a code and a link to <strong className="text-ink break-words">{state.email}</strong>.
              </p>
            </div>

            <form onSubmit={handleVerify} className="mt-6 space-y-3">
              <label htmlFor="code" className="block text-sm font-medium text-ink">
                Enter the code from the email
              </label>
              <input
                id="code"
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={14}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className={`${inputClass} text-center tracking-[0.3em] font-medium`}
              />
              {noticeBox}
              <button type="submit" disabled={verifying || !codeReady} className={primaryButton}>
                {verifying ? "Signing you in…" : isSignup ? "Confirm and continue" : "Sign in"}
              </button>
            </form>

            <p className="text-xs text-muted text-center mt-3">
              Or tap the link in the email. It only works in the browser you&apos;re using right now &mdash; on
              another device, use the code.
            </p>

            <div className="mt-6 pt-5 border-t border-card-border space-y-2 text-center">
              <p className="text-sm text-muted">
                Don&apos;t see it? <strong className="text-ink">Check your spam or junk folder</strong>, and give
                it a minute &mdash; emails can take a little while to arrive.
              </p>
              <button
                type="button"
                disabled={sending || verifying || counting}
                onClick={() => void send(state.email, state.mode, true)}
                className={`text-sm ${linkButton}`}
              >
                {sending ? "Sending…" : counting ? `Resend email in ${waitSeconds}s` : "Resend email"}
              </button>
              <p className="text-xs text-muted-2">
                Sending again replaces the old code, so use the newest email.
              </p>
              <p className="text-sm text-muted">
                Wrong address?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setCode("");
                    dispatch({ type: "change-email" });
                  }}
                  className={linkButton}
                >
                  Use a different email
                </button>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
