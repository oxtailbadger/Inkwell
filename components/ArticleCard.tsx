"use client";

import Image from "next/image";
import { useState } from "react";
import type { Article } from "@/lib/articles";

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

  const isOwner = article.submitted_by === currentUserId;
  const domain = (() => {
    try { return new URL(article.url).hostname.replace("www.", ""); } catch { return ""; }
  })();

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
      <div className="px-[18px] pt-4 pb-[18px] flex flex-col flex-1">
        <div className="flex items-center justify-between mb-[10px]">
          <div className="flex items-center gap-[9px] min-w-0">
            <div
              className="flex-none w-[26px] h-[26px] rounded-[7px] bg-amber-50 border border-amber-200 flex items-center justify-center text-xs font-semibold text-amber-700"
              style={{ fontFamily: "var(--font-display)" }}
              aria-hidden="true"
            >
              {(article.site_name ?? domain).charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider truncate">
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
          className="block text-[18px] font-semibold leading-[1.3] text-gray-900 hover:text-blue-600 mb-1.5"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {article.title ?? article.url}
        </a>
        {article.description && (
          <p className="text-[13px] leading-[1.5] text-gray-500 line-clamp-2 mb-3">{article.description}</p>
        )}
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {article.tags.map((tag) => (
              <span key={tag} className="text-[11px] bg-blue-50 text-blue-600 rounded-full px-2.5 py-0.5 font-medium capitalize">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-[13px] border-t border-gray-100 flex items-center justify-between flex-wrap gap-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleNod}
              disabled={nodding}
              className="flex items-center gap-[5px] text-[11.5px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-full px-3 py-1.5 transition-colors"
            >
              <span>{hasNodded ? "✦" : "✧"}</span>
              <span>{nodCount > 0 ? `${nodCount} ${nodCount === 1 ? "Nod" : "Nods"}` : "Nod"}</span>
            </button>
            {article.archive_url && (
              <a
                href={article.archive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-[5px] text-[11.5px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-full px-3 py-1.5 transition-colors"
              >
                Read free ↗
              </a>
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            {isOwner ? "You" : article.submitter_name ?? "Friend"} · {new Date(article.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
