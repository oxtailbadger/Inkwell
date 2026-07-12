"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QuillIcon } from "@/components/QuillIcon";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        // Sign-up mode creates the account; sign-in mode won't (an unknown
        // email gets an error instead of silently becoming a new user). Note:
        // signup still requires "Allow new signups" enabled in Supabase Auth.
        shouldCreateUser: isSignup,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

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

        {sent ? (
          <div className="py-4 text-center">
            <div className="text-4xl mb-4">📬</div>
            <p className="font-semibold text-ink">Check your inbox</p>
            <p className="text-sm text-muted mt-1">
              We sent a {isSignup ? "confirmation" : "sign-in"} link to{" "}
              <strong className="text-ink">{email}</strong>. Open it on this device to
              {isSignup ? " finish signing up" : " sign in"}.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-control border border-card-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:outline-none focus:border-accent"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-card rounded-control py-2.5 text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {loading ? "Sending…" : isSignup ? "Sign up" : "Send magic link"}
            </button>

            <p className="text-sm text-muted text-center pt-1">
              {isSignup ? (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    className="text-accent font-medium hover:underline"
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  New to Inkwell?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className="text-accent font-medium hover:underline"
                  >
                    Sign up
                  </button>
                </>
              )}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
