"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArticleCard } from "@/components/ArticleCard";
import { SubmitArticle } from "@/components/SubmitArticle";
import { QuillIcon } from "@/components/QuillIcon";
import { AuthorFeed } from "@/components/AuthorFeed";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Article } from "@/lib/articles";

const NAV_ITEMS = [
  { label: "Articles", href: "#articles" },
  { label: "Authors", href: "#authors" },
];

export default function FeedClient({
  userEmail,
  userId,
  initialArticles,
  initialTag,
}: {
  userEmail: string;
  userId: string;
  initialArticles: Article[];
  initialTag: string | null;
}) {
  const searchParams = useSearchParams();
  // Tag filter lives in the URL so filtered views are shareable and survive reloads
  const activeTag = searchParams.get("tag");
  // Set by /share (Web Share Target); captured once — SubmitArticle seeds
  // its state from the first value, and we scrub it from the URL below
  const sharedUrl = useRef(searchParams.get("share")).current;

  useEffect(() => {
    if (sharedUrl) window.history.replaceState(null, "", "/feed");
  }, [sharedUrl]);
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [activeSection, setActiveSection] = useState("articles");
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  // The first render is already populated by the server; only refetch after
  // that when the tag changes or a submission triggers a reload
  const hydratedFromServer = useRef(true);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    setFeedError(null);
    try {
      const url = activeTag ? `/api/articles?tag=${encodeURIComponent(activeTag)}` : "/api/articles";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load articles");
      setArticles(Array.isArray(data) ? data : []);
    } catch (e) {
      setFeedError(`Could not load articles: ${e instanceof Error ? e.message : "network error"}`);
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [activeTag]);

  useEffect(() => {
    if (hydratedFromServer.current && activeTag === initialTag) {
      hydratedFromServer.current = false;
      return;
    }
    hydratedFromServer.current = false;
    loadArticles();
  }, [loadArticles, activeTag, initialTag]);

  // Shallow history update: syncs useSearchParams without a server round-trip
  // (the tag-change effect below does the client-side fetch)
  function setActiveTag(tag: string | null) {
    window.history.replaceState(null, "", tag ? `/feed?tag=${encodeURIComponent(tag)}` : "/feed");
  }

  // Track which section is in view based on scroll position. Throttled via
  // rAF so the DOM read (getBoundingClientRect) and state update happen at
  // most once per frame instead of once per scroll event.
  useEffect(() => {
    let ticking = false;
    function updateActiveSection() {
      const authors = document.getElementById("authors");
      if (authors) {
        const midpoint = window.innerHeight / 2;
        setActiveSection(authors.getBoundingClientRect().top <= midpoint ? "authors" : "articles");
      }
      ticking = false;
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateActiveSection);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/articles?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setFeedError("Could not remove the article. Please try again.");
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const allTags = [...new Set(articles.flatMap((a) => a.tags))].sort();

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-paper border-b border-card-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QuillIcon className="w-6 h-6" />
            <h1 className="text-xl font-bold text-ink tracking-[-0.01em]">Inkwell</h1>
            <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" aria-hidden="true" />
            <span className="text-xs font-display text-muted-2 hidden sm:block ml-1">A place to share ideas</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-muted hidden sm:block">{userEmail}</span>
            <ThemeToggle />
            <button
              onClick={handleSignOut}
              className="text-[13px] font-semibold text-ink bg-transparent border border-card-border rounded-control px-3.5 py-2 hover:bg-ink hover:text-paper transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-8 pb-20 lg:pb-6">

        {/* Sidebar */}
        <aside className="hidden lg:block w-44 shrink-0 lg:border-r lg:border-card-border">
          <nav className="sticky top-20 space-y-1">
            {NAV_ITEMS.map(({ label, href }) => {
              const sectionId = href.replace("#", "");
              const isActive = activeSection === sectionId;
              return (
                <a
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 px-3 py-2 rounded-control text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent-tint text-accent"
                      : "text-muted hover:bg-tag-bg hover:text-ink"
                  }`}
                >
                  {label}
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 space-y-10">
          <section id="articles" className="space-y-6 scroll-mt-20">
            <SubmitArticle onSubmitted={loadArticles} initialUrl={sharedUrl ?? undefined} />

            {/* Keep the bar visible when a filter is active even if it matched
                nothing, so "All" is always reachable */}
            {(allTags.length > 0 || activeTag) && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveTag(null)}
                  className={`text-[13px] font-medium rounded-control px-3.5 py-1.5 border transition-colors ${
                    activeTag === null
                      ? "bg-accent-tint border-accent text-accent"
                      : "bg-transparent border-card-border text-ink hover:border-ink"
                  }`}
                >
                  All
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                    className={`text-[13px] font-medium rounded-control px-3.5 py-1.5 border capitalize transition-colors ${
                      activeTag === tag
                        ? "bg-accent-tint border-accent text-accent"
                        : "bg-transparent border-card-border text-ink hover:border-ink"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            <h2 className="text-xs font-display font-semibold uppercase tracking-widest text-muted">Articles from your friends</h2>

            {feedError && (
              <div className="rounded-control bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {feedError}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-card rounded-card border border-card-border h-64 animate-pulse" />
                ))}
              </div>
            ) : !feedError && articles.length === 0 ? (
              <div className="text-center py-20 text-muted">
                <p className="text-4xl mb-3">📰</p>
                {activeTag ? (
                  <>
                    <p className="font-medium text-ink">No articles tagged yet</p>
                    <button
                      onClick={() => setActiveTag(null)}
                      className="text-sm mt-1 text-accent border-b border-accent"
                    >
                      Show all articles
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-ink">No articles yet</p>
                    <p className="text-sm mt-1">Be the first to share something worth reading.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {articles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    onDelete={handleDelete}
                    currentUserId={userId}
                  />
                ))}
              </div>
            )}
          </section>

          <section id="authors" className="scroll-mt-20">
            <AuthorFeed />
          </section>
        </main>
      </div>

      {/* Mobile bottom nav — the sidebar is desktop-only */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-10 bg-card border-t border-card-border flex">
        {NAV_ITEMS.map(({ label, href }) => {
          const sectionId = href.replace("#", "");
          const isActive = activeSection === sectionId;
          return (
            <a
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
                isActive ? "text-accent border-t-2 border-accent -mt-px" : "text-muted"
              }`}
            >
              {label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
