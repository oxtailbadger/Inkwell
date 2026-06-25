"use client";

import { useState } from "react";

const PRESET_TAGS = [
  "Politics",
  "Business",
  "Science",
  "Tech",
  "Health",
  "Culture",
  "Sports",
  "Lifestyle",
] as const;

type OGData = {
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
};

export function SubmitArticle({ onSubmitted }: { onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [archiveUrl, setArchiveUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [preview, setPreview] = useState<OGData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function reset() {
    setUrl("");
    setArchiveUrl("");
    setSelectedTags([]);
    setPreview(null);
    setError(null);
    setOpen(false);
  }

  async function fetchPreview() {
    if (!url) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/fetch-og", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Could not fetch article metadata");
      setPreview(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setFetching(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      let ogData = preview;
      if (!ogData) {
        const ogRes = await fetch("/api/fetch-og", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (ogRes.ok) ogData = await ogRes.json();
      }

      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          ...ogData,
          tags: selectedTags.map((t) => t.toLowerCase()),
          archive_url: archiveUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      reset();
      onSubmitted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Share article
        </button>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setPreview(null); }}
              placeholder="Paste article URL…"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={fetchPreview}
              disabled={!url || fetching}
              className="bg-gray-100 text-gray-700 rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              {fetching ? "…" : "Preview"}
            </button>
          </div>

          {preview && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-900 line-clamp-1">{preview.title ?? url}</p>
              {preview.description && (
                <p className="text-gray-500 line-clamp-2 mt-0.5">{preview.description}</p>
              )}
              {preview.site_name && (
                <p className="text-xs text-gray-400 mt-1">{preview.site_name}</p>
              )}
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Category</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                      active
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">
              Do you have an archive.is link?{" "}
              <a
                href="https://archive.is"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-600 hover:text-amber-800 underline"
              >
                Open archive.is ↗
              </a>
            </p>
            <input
              type="url"
              value={archiveUrl}
              onChange={(e) => setArchiveUrl(e.target.value)}
              placeholder="https://archive.is/…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              onClick={reset}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!url || submitting}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Sharing…" : "Share"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
