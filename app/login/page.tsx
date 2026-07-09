"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QuillIcon } from "@/components/QuillIcon";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  // OTP entry exists for the iOS PWA: home-screen web apps have isolated
  // storage, so a magic link opening in the browser can never sign the PWA
  // in — typing the emailed code creates the session inside the PWA itself
  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });

    if (error) {
      setError(error.message);
      setVerifying(false);
    } else {
      window.location.href = "/feed";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
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
          <div className="py-4">
            <div className="text-center">
              <div className="text-4xl mb-4">📬</div>
              <p className="font-semibold text-ink">Check your inbox</p>
              <p className="text-sm text-muted mt-1">
                We sent a sign-in link and code to <strong className="text-ink">{email}</strong>
              </p>
            </div>
            <form onSubmit={handleVerifyCode} className="mt-6 space-y-3">
              <label htmlFor="otp" className="block text-sm font-medium text-ink">
                Or enter the code from the email
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-control border border-card-border bg-card px-3.5 py-2.5 text-sm text-ink text-center tracking-[0.3em] font-medium placeholder:text-muted-2 focus:outline-none focus:border-accent"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={verifying || !code.trim()}
                className="w-full bg-accent text-card rounded-control py-2.5 text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {verifying ? "Verifying…" : "Sign in with code"}
              </button>
            </form>
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-card rounded-control py-2.5 text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
