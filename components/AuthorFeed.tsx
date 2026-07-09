"use client";

import { useEffect, useState } from "react";
import { getHostname } from "@/lib/url";

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
  const host = getHostname(author.website_url);
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null;
}

// Own component (not inline in the map) so each card tracks its own
// image-load failure independently
function AuthorAvatar({ author }: { author: Author }) {
  const [failed, setFailed] = useState(false);
  const src = iconSrc(author);

  return (
    <div
      className="flex-none w-8 h-8 rounded-control bg-ink text-paper flex items-center justify-center overflow-hidden text-[13px] font-semibold"
      aria-hidden="true"
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={32}
          height={32}
          className="w-full h-full object-contain"
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
  const host = getHostname(websiteUrl);
  if (!host) return "their site";
  return host.endsWith(".substack.com") ? "Substack" : host;
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
          <div key={i} className="bg-card rounded-card border border-card-border h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (failed) {
    return (
      <div className="space-y-4">
        <h2 className="inline-block text-sm font-display font-semibold uppercase tracking-widest text-accent border-b-2 border-accent pb-1">From the Authors</h2>
        <p className="text-sm text-muted">Couldn&apos;t load author feeds right now — try refreshing.</p>
      </div>
    );
  }

  if (authors.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-display font-semibold uppercase tracking-widest text-muted">From the Authors</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {authors.map((author) => (
          <div key={author.id} className="bg-card rounded-card border border-card-border overflow-hidden">
            {/* flex-wrap: at 2-column card widths (roughly the sm-lg range,
                sidebar hidden) there isn't room for avatar + name + button
                on one line — the button drops to its own row rather than
                the name getting crushed and truncated */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-[18px] border-b border-card-border">
              <AuthorAvatar author={author} />
              <div className="flex-1 min-w-[120px]">
                <p className="text-base font-semibold text-ink truncate">
                  {author.name}
                </p>
                <p className="text-xs font-display uppercase tracking-[0.04em] text-muted-2 mt-0.5">
                  {author.articles.length} {author.articles.length === 1 ? "article" : "articles"}
                </p>
              </div>
              <a
                href={author.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-none text-[11.5px] font-semibold tracking-[0.02em] text-accent border-b border-accent whitespace-nowrap"
              >
                Read on {siteLabel(author.website_url)} ↗
              </a>
            </div>
            <ul className="divide-y divide-card-border">
              {author.articles.length === 0 ? (
                <li className="px-5 py-4 text-sm text-muted">No free articles found.</li>
              ) : (
                author.articles.map((article) => (
                  <li key={article.url} className="px-5 py-4">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-title-xs font-semibold text-ink hover:text-accent mb-1.5"
                    >
                      {article.title}
                    </a>
                    {article.description && (
                      <p className="text-xs text-muted line-clamp-2">{article.description}</p>
                    )}
                    {article.published_at && (
                      <p className="text-xs font-display text-muted-2 mt-1.5">
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
