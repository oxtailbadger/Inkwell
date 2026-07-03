"use client";

import Image from "next/image";
import { useState } from "react";

type Article = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  tags: string[];
  archive_url: string | null;
  submitted_by: string;
  created_at: string;
  nod_count: number;
  user_has_nodded: boolean;
  submitter_name: string | null;
};

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

    const res = await fetch("/api/nods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article_id: article.id }),
    });

    if (!res.ok) {
      // Revert on failure
      setHasNodded((prev) => !prev);
      setNodCount((prev) => hasNodded ? prev + 1 : prev - 1);
    }
    setNodding(false);
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
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{article.site_name ?? domain}</span>
          {isOwner && (
            <button
              onClick={() => onDelete(article.id)}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Remove
            </button>
          )}
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block font-semibold text-gray-900 hover:text-blue-600 leading-snug mb-2 text-lg"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {article.title ?? article.url}
        </a>
        {article.description && (
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">{article.description}</p>
        )}
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {article.tags.map((tag) => (
              <span key={tag} className="text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 font-medium capitalize">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleNod}
              disabled={nodding}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                hasNodded
                  ? "bg-amber-50 border-amber-300 text-amber-700"
                  : "bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600"
              }`}
            >
              <span>{hasNodded ? "✦" : "✧"}</span>
              <span>{nodCount > 0 ? `${nodCount} ${nodCount === 1 ? "Nod" : "Nods"}` : "Nod"}</span>
            </button>
            {article.archive_url && (
              <a
                href={article.archive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-600 hover:text-amber-800 font-medium"
              >
                Archive ↗
              </a>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {isOwner ? "You" : article.submitter_name ?? "Friend"} · {new Date(article.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
