"use client";

import { useEffect, useRef, useState } from "react";

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
  site_icon_url: string | null;
};

// data is null when metadata couldn't be fetched; manual means the site
// blocks automated previews and the user should fill in details themselves
async function requestMetadata(url: string): Promise<{ data: OGData | null; manual: boolean }> {
  const res = await fetch("/api/fetch-og", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = await res.json();
  if (res.ok) return { data: body, manual: false };
  return { data: null, manual: Boolean(body.manual) };
}

// Shared outline-button treatment (header CTA / Preview / theme toggle):
// transparent bg, hairline border, inverts to filled ink/paper on hover.
const OUTLINE_BUTTON =
  "text-[13px] font-semibold text-ink bg-transparent border border-card-border rounded-control hover:bg-ink hover:text-paper transition-colors";

export function SubmitArticle({
  onSubmitted,
  initialUrl,
}: {
  onSubmitted: () => void;
  initialUrl?: string;
}) {
  // initialUrl comes from the Web Share Target flow (/share -> /feed?share=);
  // it seeds the form once — later prop changes are intentionally ignored
  const [open, setOpen] = useState(Boolean(initialUrl));
  const [url, setUrl] = useState(initialUrl ?? "");
  const [archiveUrl, setArchiveUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [preview, setPreview] = useState<OGData | null>(null);
  const [archiveSuggested, setArchiveSuggested] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  // Best-effort: look up an existing archive.today snapshot and pre-fill the
  // archive field. Fired alongside the preview fetch, never blocks it.
  async function checkArchive(articleUrl: string) {
    try {
      const res = await fetch(`/api/archive-check?url=${encodeURIComponent(articleUrl)}`);
      const body = await res.json();
      if (res.ok && body.found && body.archive_url && !archiveUrl) {
        setArchiveUrl(body.archive_url);
        setArchiveSuggested(true);
      }
    } catch {
      // Lookup is a bonus; the manual field and links still work
    }
  }

  function reset() {
    setUrl("");
    setArchiveUrl("");
    setArchiveSuggested(false);
    setSelectedTags([]);
    setPreview(null);
    setManualMode(false);
    setManualTitle("");
    setManualDescription("");
    setError(null);
    setOpen(false);
  }

  async function fetchPreview() {
    if (!url) return;
    setFetching(true);
    setError(null);
    setManualMode(false);
    setPreview(null);
    void checkArchive(url);
    try {
      const { data, manual } = await requestMetadata(url);
      if (manual) setManualMode(true);
      else if (data) setPreview(data);
      else setError("Could not fetch article metadata");
    } catch {
      setError("Could not fetch article metadata");
    } finally {
      setFetching(false);
    }
  }

  // Auto-fetch the preview when the form was opened by a share
  const autoPreviewed = useRef(false);
  useEffect(() => {
    if (initialUrl && !autoPreviewed.current) {
      autoPreviewed.current = true;
      fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      let ogData: OGData | null = preview;

      if (!ogData && !manualMode) {
        const { data, manual } = await requestMetadata(url);
        if (manual) {
          setManualMode(true);
          setSubmitting(false);
          return;
        }
        ogData = data;
      }

      if (manualMode) {
        ogData = {
          title: manualTitle.trim() || null,
          description: manualDescription.trim() || null,
          image_url: null,
          site_name: null,
          site_icon_url: null,
        };
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
        <button onClick={() => setOpen(true)} className={`${OUTLINE_BUTTON} px-[18px] py-2.5`}>
          + Share article
        </button>
      ) : (
        <div className="bg-card border border-card-border rounded-card p-7 space-y-[18px]">
          <p className="text-xs font-display font-semibold uppercase tracking-widest text-muted">
            Share an article
          </p>

          <div className="flex gap-2.5">
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setPreview(null);
                setManualMode(false);
                // A suggested snapshot belongs to the previous URL
                if (archiveSuggested) { setArchiveUrl(""); setArchiveSuggested(false); }
              }}
              placeholder="Paste article URL…"
              className="flex-1 bg-card border border-card-border rounded-control px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:outline-none focus:border-accent"
            />
            <button
              onClick={fetchPreview}
              disabled={!url || fetching}
              className={`${OUTLINE_BUTTON} px-5 disabled:opacity-50`}
            >
              {fetching ? "…" : "Preview"}
            </button>
          </div>

          {preview && (
            <div className="bg-paper border border-card-border rounded-[10px] px-4 py-3.5">
              <p className="text-sm font-semibold text-ink line-clamp-1 mb-1">{preview.title ?? url}</p>
              {preview.description && (
                <p className="text-[13px] text-muted line-clamp-2 mb-1.5">{preview.description}</p>
              )}
              {preview.site_name && (
                <p className="text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-muted-2">
                  {preview.site_name}
                </p>
              )}
            </div>
          )}

          {manualMode && (
            <div className="bg-paper border border-card-border rounded-control p-3.5 space-y-3">
              <p className="text-xs text-ink font-medium">
                This site blocks automatic previews. Add a title and description so your friends know what it&apos;s about.
              </p>
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Article title…"
                className="w-full border border-card-border rounded-control px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-2 bg-card focus:outline-none focus:border-accent"
              />
              <textarea
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="Short description (optional)…"
                rows={2}
                className="w-full border border-card-border rounded-control px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-2 bg-card focus:outline-none focus:border-accent resize-none"
              />
            </div>
          )}

          <div>
            <p className="text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-muted mb-2.5">
              Category
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`text-[13px] font-medium rounded-control px-3.5 py-1.5 border transition-colors ${
                      active
                        ? "bg-accent-tint border-accent text-accent"
                        : "bg-transparent border-card-border text-ink hover:border-ink"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[13px] text-muted mb-2">
              Do you have an archive.is link?{" "}
              {url ? (
                <>
                  <a
                    href={`https://archive.ph/newest/${url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent border-b border-accent"
                  >
                    Find snapshot ↗
                  </a>
                  {" · "}
                  <a
                    href={`https://archive.ph/?url=${encodeURIComponent(url)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent border-b border-accent"
                  >
                    Create one ↗
                  </a>
                </>
              ) : (
                <a
                  href="https://archive.is"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent border-b border-accent"
                >
                  Open archive.is ↗
                </a>
              )}
            </p>
            <input
              type="url"
              value={archiveUrl}
              onChange={(e) => { setArchiveUrl(e.target.value); setArchiveSuggested(false); }}
              placeholder="https://archive.is/…"
              className="w-full bg-card border border-card-border rounded-control px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:outline-none focus:border-accent"
            />
            {archiveSuggested && archiveUrl && (
              <p className="text-xs text-accent mt-1.5">
                Found an existing snapshot — clear it if you&apos;d rather not include it.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2.5">
            <button
              onClick={reset}
              className="text-[13px] font-semibold text-muted hover:text-ink px-3.5 py-2.5"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!url || submitting || (manualMode && !manualTitle.trim())}
              className="text-[13px] font-semibold text-card bg-accent hover:bg-accent-hover border border-accent hover:border-accent-hover rounded-control px-[22px] py-2.5 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Sharing…" : "Share"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
