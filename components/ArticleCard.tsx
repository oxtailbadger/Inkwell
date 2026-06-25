"use client";

import Image from "next/image";

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
  const isOwner = article.submitted_by === currentUserId;
  const domain = (() => {
    try { return new URL(article.url).hostname.replace("www.", ""); } catch { return ""; }
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
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
      <div className="p-4">
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
          className="block font-semibold text-gray-900 hover:text-blue-600 leading-snug mb-2"
        >
          {article.title ?? article.url}
        </a>
        {article.description && (
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">{article.description}</p>
        )}
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {article.tags.map((tag) => (
              <span key={tag} className="text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {isOwner ? "Shared by you" : "Shared by a friend"} · {new Date(article.created_at).toLocaleDateString()}
          </p>
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
      </div>
    </div>
  );
}
