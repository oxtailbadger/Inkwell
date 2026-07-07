"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArticleCard } from "@/components/ArticleCard";
import { SubmitArticle } from "@/components/SubmitArticle";
import { QuillIcon } from "@/components/QuillIcon";
import { AuthorFeed } from "@/components/AuthorFeed";
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

  // Track which section is in view based on scroll position
  useEffect(() => {
    function onScroll() {
      const authors = document.getElementById("authors");
      if (!authors) return;
      const midpoint = window.innerHeight / 2;
      setActiveSection(authors.getBoundingClientRect().top <= midpoint ? "authors" : "articles");
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QuillIcon className="w-7 h-7" />
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Inkwell</h1>
            <span className="text-sm text-slate-400 italic hidden sm:block" style={{ fontFamily: "var(--font-display)" }}>A place to share ideas</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">{userEmail}</span>
            <button onClick={handleSignOut} className="text-sm text-gray-500 hover:text-gray-700">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-8 pb-20 lg:pb-6">

        {/* Sidebar */}
        <aside className="hidden lg:block w-44 shrink-0 lg:border-r lg:border-amber-200">
          <nav className="sticky top-20 space-y-1">
            {NAV_ITEMS.map(({ label, href }) => {
              const sectionId = href.replace("#", "");
              const isActive = activeSection === sectionId;
              return (
                <a
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-amber-700 text-white"
                      : "text-gray-600 hover:bg-amber-50 hover:text-gray-900"
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
                  className={`text-sm rounded-full px-3 py-1 font-medium transition-colors ${
                    activeTag === null ? "bg-amber-700 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-amber-50"
                  }`}
                >
                  All
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                    className={`text-sm rounded-full px-3 py-1 font-medium transition-colors capitalize ${
                      activeTag === tag ? "bg-amber-700 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-amber-50"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            <h2 className="text-base font-medium text-gray-400 tracking-widest uppercase" style={{ fontFamily: "var(--font-display)", letterSpacing: "0.18em" }}>Articles from your friends</h2>

            {feedError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {feedError}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 h-64 animate-pulse" />
                ))}
              </div>
            ) : !feedError && articles.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-4xl mb-3">📰</p>
                {activeTag ? (
                  <>
                    <p className="font-medium">No articles tagged yet</p>
                    <button
                      onClick={() => setActiveTag(null)}
                      className="text-sm mt-1 text-blue-600 hover:text-blue-800 underline"
                    >
                      Show all articles
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-medium">No articles yet</p>
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
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-amber-200 flex">
        {NAV_ITEMS.map(({ label, href }) => {
          const sectionId = href.replace("#", "");
          const isActive = activeSection === sectionId;
          return (
            <a
              key={href}
              href={href}
              className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
                isActive ? "text-amber-700 border-t-2 border-amber-700 -mt-px" : "text-gray-500"
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
