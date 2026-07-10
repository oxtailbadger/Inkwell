"use client";

import { useState } from "react";
import Link from "next/link";
import { QuillIcon } from "@/components/QuillIcon";
import { useTheme } from "@/lib/useTheme";

const FAQ = [
  {
    question: "What is Inkwell?",
    answer:
      "Inkwell is a shared reading feed for a small group of friends — paste a link, add a topic tag, and it shows up for everyone to \"Nod\" if they liked it. A few curated authors' latest free posts show up alongside the group's own shares.",
  },
  {
    question: "How can I share articles directly from my iPhone or Android?",
    answer: "android-ios", // rendered specially below
  },
];

export default function ProfileClient({
  userEmail,
  initialDisplayName,
}: {
  userEmail: string;
  initialDisplayName: string;
}) {
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [savedName, setSavedName] = useState(initialDisplayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [feedback, setFeedback] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save your display name");
      setSavedName(data.display_name);
      setDisplayName(data.display_name);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your display name");
      setDisplayName(savedName);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendFeedback(e: React.FormEvent) {
    e.preventDefault();
    setSendingFeedback(true);
    setFeedbackError(null);
    setFeedbackSent(false);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: feedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send your feedback");
      setFeedback("");
      setFeedbackSent(true);
    } catch (e) {
      setFeedbackError(e instanceof Error ? e.message : "Could not send your feedback");
    } finally {
      setSendingFeedback(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4 py-10">
      <div className="bg-card rounded-card border border-card-border px-10 pt-10 pb-10 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-paper rounded-control p-4 mb-4 border border-card-border">
            <QuillIcon className="w-14 h-14" />
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">Profile</h1>
          <p className="text-sm font-display text-muted-2 mt-1 text-center">{userEmail}</p>
        </div>

        {/* Display name */}
        <form onSubmit={handleSave} className="space-y-3 pb-7 mb-7 border-b border-card-border">
          <label htmlFor="display_name" className="block text-sm font-medium text-ink">
            Display name
          </label>
          <input
            id="display_name"
            type="text"
            required
            maxLength={60}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSaved(false);
            }}
            className="w-full rounded-control border border-card-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:outline-none focus:border-accent"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !displayName.trim() || displayName === savedName}
              className="bg-accent text-card rounded-control px-4 py-2 text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-sm text-accent">Saved</span>}
          </div>
        </form>

        {/* Appearance */}
        <div className="space-y-3 pb-7 mb-7 border-b border-card-border">
          <p className="text-sm font-medium text-ink">Appearance</p>
          <div className="inline-flex rounded-control border border-card-border overflow-hidden">
            {(["light", "dark"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={theme === option}
                onClick={() => setTheme(option)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  theme === option
                    ? "bg-accent-tint text-accent"
                    : "text-muted hover:text-ink"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink mb-1">Frequently asked questions</p>
          {FAQ.map(({ question, answer }) => (
            <details
              key={question}
              className="group rounded-control border border-card-border px-3.5 py-2.5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="text-sm font-medium text-ink cursor-pointer list-none flex items-center justify-between gap-2">
                {question}
                <span className="text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="text-sm text-muted mt-2">
                {answer === "android-ios" ? (
                  <p>
                    On Android, install Inkwell as an app (your browser's "Add to Home Screen" option), then
                    share any article straight from your browser's share sheet — Inkwell will show up as a
                    destination. iPhone doesn't support that kind of share sheet integration, so instead use{" "}
                    <a
                      href="https://www.icloud.com/shortcuts/660b1b59532742bdaeb2466838f27cda"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent border-b border-accent"
                    >
                      this Shortcut
                    </a>{" "}
                    — add it once, then share into Inkwell from any app's share sheet.
                  </p>
                ) : (
                  <p>{answer}</p>
                )}
              </div>
            </details>
          ))}
        </div>

        {/* Feedback */}
        <form
          onSubmit={handleSendFeedback}
          className="space-y-3 pt-7 mt-7 border-t border-card-border"
        >
          <div>
            <label htmlFor="feedback" className="block text-sm font-medium text-ink">
              Send feedback
            </label>
            <p className="text-sm text-muted mt-1">
              Found a bug or have an idea? Tell me — it goes straight to me.
            </p>
          </div>
          <textarea
            id="feedback"
            rows={4}
            maxLength={4000}
            value={feedback}
            onChange={(e) => {
              setFeedback(e.target.value);
              setFeedbackSent(false);
            }}
            placeholder="What's on your mind?"
            className="w-full rounded-control border border-card-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:outline-none focus:border-accent resize-y"
          />
          {feedbackError && <p className="text-sm text-danger">{feedbackError}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={sendingFeedback || !feedback.trim()}
              className="bg-accent text-card rounded-control px-4 py-2 text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {sendingFeedback ? "Sending…" : "Send feedback"}
            </button>
            {feedbackSent && <span className="text-sm text-accent">Thanks — got it!</span>}
          </div>
        </form>

        <Link
          href="/feed"
          className="block text-center text-sm text-muted hover:text-ink mt-8"
        >
          ← Back to the feed
        </Link>
      </div>
    </div>
  );
}
