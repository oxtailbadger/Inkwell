"use client";

import { useEffect, useState } from "react";

type AuthorArticle = {
  url: string;
  title: string | null;
  description: string | null;
  published_at: string | null;
};

type Author = {
  id: string;
  name: string;
  website_url: string;
  articles: AuthorArticle[];
};

export function AuthorFeed() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/author-articles")
      .then((r) => r.json())
      .then((data) => setAuthors(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (authors.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-base font-medium text-gray-400 tracking-widest uppercase" style={{ fontFamily: "var(--font-display)", letterSpacing: "0.18em" }}>From the Authors</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {authors.map((author) => (
          <div key={author.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <a
                href={author.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-gray-900 hover:text-blue-600 text-lg"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {author.name} ↗
              </a>
            </div>
            <ul className="divide-y divide-gray-100">
              {author.articles.length === 0 ? (
                <li className="px-4 py-3 text-sm text-gray-400">No free articles found.</li>
              ) : (
                author.articles.map((article) => (
                  <li key={article.url} className="px-4 py-3">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-base font-medium text-gray-900 hover:text-blue-600 leading-snug mb-1"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {article.title}
                    </a>
                    {article.description && (
                      <p className="text-xs text-gray-500 line-clamp-2">{article.description}</p>
                    )}
                    {article.published_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(article.published_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </p>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
