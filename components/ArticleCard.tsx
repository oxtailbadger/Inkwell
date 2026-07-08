"use client";

import Image from "next/image";
import { useState } from "react";
import type { Article } from "@/lib/articles";
import { getHostname } from "@/lib/url";

export function ArticleCard({
  article,
  onDelete,
  currentUserId,
}: {
  article: Article;
  onDelete: (id: string) => void;
  currentUserId: string;
}) {
  const [nodCount, setNodCount] = useState(article.nod_count);
  const [hasNodded, setHasNodded] = useState(article.user_has_nodded);
  const [nodding, setNodding] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  const isOwner = article.submitted_by === currentUserId;
  const domain = getHostname(article.url) ?? "";

  // Publication badge: stored Microlink logo, else Google's favicon service
  // (covers pre-existing rows and manual-mode submissions), else the letter
  // monogram if the image 404s or the URL is unparseable
  const iconSrc =
    article.site_icon_url ??
    (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null);

  async function toggleNod() {
    if (nodding) return;
    setNodding(true);
    // Optimistic update
    setHasNodded((prev) => !prev);
    setNodCount((prev) => hasNodded ? prev - 1 : prev + 1);

    try {
      const res = await fetch("/api/nods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article_id: article.id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert on failure (non-OK response or network error)
      setHasNodded((prev) => !prev);
      setNodCount((prev) => hasNodded ? prev + 1 : prev - 1);
    } finally {
      setNodding(false);
    }
  }

  return (
    <div className="bg-card rounded-card border border-card-border overflow-hidden flex flex-col">
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="block">
        {article.image_url ? (
          <div className="relative w-full h-[170px] bg-placeholder-bg">
            <Image
              src={article.image_url}
              alt={article.title ?? "Article image"}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="stripe-ph w-full h-[170px] bg-placeholder-bg" aria-hidden="true" />
        )}
      </a>
      <div className="px-[22px] pt-[22px] pb-[22px] flex flex-col flex-1">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.25 min-w-0">
            <div
              className="flex-none w-5 h-5 rounded-badge-sm bg-ink text-paper flex items-center justify-center overflow-hidden text-[11px] font-semibold"
              aria-hidden="true"
            >
              {iconSrc && !iconFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconSrc}
                  alt=""
                  width={20}
                  height={20}
                  className="w-full h-full object-contain"
                  onError={() => setIconFailed(true)}
                />
              ) : (
                (article.site_name ?? domain).charAt(0).toUpperCase()
              )}
            </div>
            <span className="text-xs font-display font-semibold uppercase tracking-[0.08em] text-muted truncate">
              {article.site_name ?? domain}
            </span>
          </div>
          {isOwner && (
            <button
              onClick={() => onDelete(article.id)}
              className="flex-none text-xs text-red-500 hover:text-red-600"
            >
              Remove
            </button>
          )}
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-headline font-semibold text-ink hover:text-accent mb-2"
        >
          {article.title ?? article.url}
        </a>
        {article.description && (
          <p className="text-body-sm text-muted line-clamp-2 mb-3.5">{article.description}</p>
        )}
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-[7px] mb-4">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-semibold uppercase tracking-wider font-display bg-tag-bg text-tag-fg border border-tag-border rounded-tag px-[9px] py-[3px]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-3.5 border-t border-card-border flex items-center justify-between flex-wrap gap-y-2">
          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleNod}
              disabled={nodding}
              aria-pressed={hasNodded}
              className={`flex items-center gap-1.5 text-[12.5px] font-semibold rounded-control px-3 py-1.5 border transition-colors ${
                hasNodded
                  ? "bg-accent-tint border-accent text-accent"
                  : "bg-card border-card-border text-muted"
              }`}
            >
              <span>{hasNodded ? "✦" : "✧"}</span>
              <span>
                {hasNodded ? "Nodded" : "Nod"}
                {nodCount > 0 ? ` · ${nodCount}` : ""}
              </span>
            </button>
            {article.archive_url && (
              <a
                href={article.archive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11.5px] font-semibold tracking-[0.02em] text-accent border-b border-accent"
              >
                Read free ↗
              </a>
            )}
          </div>
          <p className="text-xs font-display text-muted-2">
            {isOwner ? "You" : article.submitter_name ?? "Friend"} · {new Date(article.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
