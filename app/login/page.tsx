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
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <div className="bg-white rounded-2xl shadow-md border border-amber-100 px-10 pt-10 pb-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-amber-50 rounded-2xl p-4 mb-4 shadow-inner border border-amber-100">
            <QuillIcon className="w-20 h-20" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 font-display">Inkwell</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            Articles worth reading, shared by friends.
          </p>
        </div>

        {sent ? (
          <div className="py-4">
            <div className="text-center">
              <div className="text-4xl mb-4">📬</div>
              <p className="font-semibold text-slate-900">Check your inbox</p>
              <p className="text-sm text-slate-500 mt-1">
                We sent a sign-in link and code to <strong>{email}</strong>
              </p>
            </div>
            <form onSubmit={handleVerifyCode} className="mt-6 space-y-3">
              <label htmlFor="otp" className="block text-sm font-medium text-slate-700">
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-center tracking-[0.3em] font-medium focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={verifying || !code.trim()}
                className="w-full bg-amber-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors"
              >
                {verifying ? "Verifying…" : "Sign in with code"}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
