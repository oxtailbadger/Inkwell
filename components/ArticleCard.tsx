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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      {article.image_url && (
        <a href={article.url} target="_blank" rel="noopener noreferrer">
          <div className="relative w-full h-44 bg-gray-100">
            <Image
              src={article.image_url}
              alt={article.title ?? "Article image"}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        </a>
      )}
      <div className="px-4.5 pt-4 pb-4.5 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.25 min-w-0">
            <div
              className="flex-none w-6.5 h-6.5 rounded-badge-sm bg-amber-50 border border-amber-200 flex items-center justify-center overflow-hidden text-xs font-display font-semibold text-amber-700"
              aria-hidden="true"
            >
              {iconSrc && !iconFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconSrc}
                  alt=""
                  width={20}
                  height={20}
                  className="w-5 h-5 object-contain"
                  onError={() => setIconFailed(true)}
                />
              ) : (
                (article.site_name ?? domain).charAt(0).toUpperCase()
              )}
            </div>
            <span className="text-2xs text-gray-400 font-semibold uppercase tracking-wider truncate">
              {article.site_name ?? domain}
            </span>
          </div>
          {isOwner && (
            <button
              onClick={() => onDelete(article.id)}
              className="flex-none text-xs text-red-400 hover:text-red-600"
            >
              Remove
            </button>
          )}
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-title-sm font-display font-semibold text-gray-900 hover:text-blue-600 mb-1.5"
        >
          {article.title ?? article.url}
        </a>
        {article.description && (
          <p className="text-body-sm text-gray-500 line-clamp-2 mb-3">{article.description}</p>
        )}
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {article.tags.map((tag) => (
              <span key={tag} className="text-2xs bg-blue-50 text-blue-600 rounded-full px-2.5 py-0.5 font-medium capitalize">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-3.25 border-t border-gray-100 flex items-center justify-between flex-wrap gap-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleNod}
              disabled={nodding}
              aria-pressed={hasNodded}
              className="flex items-center gap-1.25 text-pill font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-full px-3 py-1.5 transition-colors"
            >
              <span>{hasNodded ? "✦" : "✧"}</span>
              <span>{nodCount > 0 ? `${nodCount} ${nodCount === 1 ? "Nod" : "Nods"}` : "Nod"}</span>
            </button>
            {article.archive_url && (
              <a
                href={article.archive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.25 text-pill font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-full px-3 py-1.5 transition-colors"
              >
                Read free ↗
              </a>
            )}
          </div>
          <p className="text-2xs text-gray-500">
            {isOwner ? "You" : article.submitter_name ?? "Friend"} · {new Date(article.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
