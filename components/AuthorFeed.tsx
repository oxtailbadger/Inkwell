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
  site_icon_url: string | null;
  articles: AuthorArticle[];
};

// Same fallback chain as ArticleCard: an optional stored override, else
// Google's favicon service by domain, else the caller falls back to the
// letter monogram if this errors or the URL is unparseable.
function iconSrc(author: Pick<Author, "website_url" | "site_icon_url">): string | null {
  if (author.site_icon_url) return author.site_icon_url;
  try {
    const host = new URL(author.website_url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return null;
  }
}

// Own component (not inline in the map) so each card tracks its own
// image-load failure independently
function AuthorAvatar({ author }: { author: Author }) {
  const [failed, setFailed] = useState(false);
  const src = iconSrc(author);

  return (
    <div
      className="flex-none w-11 h-11 rounded-[10px] bg-amber-50 border border-amber-200 flex items-center justify-center overflow-hidden text-[20px] font-semibold text-amber-700"
      style={{ fontFamily: "var(--font-display)" }}
      aria-hidden="true"
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={28}
          height={28}
          className="w-7 h-7 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        author.name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

// The design spec's meta line is "Publication · count", but authors.website_url
// is the only source we have — no separate publication-name field — so we
// derive a short label from the domain instead of fabricating one.
function siteLabel(websiteUrl: string): string {
  try {
    const host = new URL(websiteUrl).hostname.replace(/^www\./, "");
    return host.endsWith(".substack.com") ? "Substack" : host;
  } catch {
    return "their site";
  }
}

export function AuthorFeed() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/author-articles")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setAuthors(Array.isArray(data) ? data : []))
      .catch(() => setFailed(true))
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

  if (failed) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-medium text-gray-400 tracking-widest uppercase" style={{ fontFamily: "var(--font-display)", letterSpacing: "0.18em" }}>From the Authors</h2>
        <p className="text-sm text-gray-400">Couldn&apos;t load author feeds right now — try refreshing.</p>
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
            {/* flex-wrap: at 2-column card widths (roughly the sm-lg range,
                sidebar hidden) there isn't room for avatar + name + button
                on one line — the button drops to its own row rather than
                the name getting crushed and truncated */}
            <div className="flex flex-wrap items-center gap-x-[13px] gap-y-2 px-[18px] py-4 border-b border-gray-100">
              <AuthorAvatar author={author} />
              <div className="flex-1 min-w-[120px]">
                <p
                  className="text-[19px] font-semibold leading-[1.15] text-gray-900 truncate"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {author.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {author.articles.length} {author.articles.length === 1 ? "article" : "articles"}
                </p>
              </div>
              <a
                href={author.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-none text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-full px-[13px] py-1.5 whitespace-nowrap transition-colors"
              >
                Read on {siteLabel(author.website_url)} ↗
              </a>
            </div>
            <ul className="divide-y divide-gray-100">
              {author.articles.length === 0 ? (
                <li className="px-[18px] py-3.5 text-sm text-gray-400">No free articles found.</li>
              ) : (
                author.articles.map((article) => (
                  <li key={article.url} className="px-[18px] py-3.5">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-base font-medium text-gray-900 hover:text-blue-600 leading-[1.35] mb-[3px]"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {article.title}
                    </a>
                    {article.description && (
                      <p className="text-xs text-gray-500 line-clamp-2">{article.description}</p>
                    )}
                    {article.published_at && (
                      <p className="text-[11px] text-gray-400 mt-1.5">
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
