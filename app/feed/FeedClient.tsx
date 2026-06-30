"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ArticleCard } from "@/components/ArticleCard";
import { SubmitArticle } from "@/components/SubmitArticle";
import { QuillIcon } from "@/components/QuillIcon";
import { AuthorFeed } from "@/components/AuthorFeed";

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
};

const NAV_ITEMS = [
  { label: "Articles", href: "#articles" },
  { label: "Authors", href: "#authors" },
];

export default function FeedClient({ userEmail, userId }: { userEmail: string; userId: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("articles");
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    setFeedError(null);
    const url = activeTag ? `/api/articles?tag=${encodeURIComponent(activeTag)}` : "/api/articles";
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      setFeedError(data.error ?? "Failed to load articles");
      setArticles([]);
    } else {
      setArticles(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, [activeTag]);

  useEffect(() => { loadArticles(); }, [loadArticles]);

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
    await fetch(`/api/articles?id=${id}`, { method: "DELETE" });
    setArticles((prev) => prev.filter((a) => a.id !== id));
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
            <h1 className="text-lg font-bold text-slate-900">Inkwell</h1>
            <span className="text-sm text-slate-400 italic hidden sm:block">A place to share ideas</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">{userEmail}</span>
            <button onClick={handleSignOut} className="text-sm text-gray-500 hover:text-gray-700">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-8">

        {/* Sidebar */}
        <aside className="hidden lg:block w-44 shrink-0">
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
                      ? "bg-slate-900 text-white"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
            <SubmitArticle onSubmitted={loadArticles} />

            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveTag(null)}
                  className={`text-sm rounded-full px-3 py-1 font-medium transition-colors ${
                    activeTag === null ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  All
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                    className={`text-sm rounded-full px-3 py-1 font-medium transition-colors capitalize ${
                      activeTag === tag ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Articles from your friends</h2>

            {feedError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                Could not load articles: {feedError}
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
                <p className="font-medium">No articles yet</p>
                <p className="text-sm mt-1">Be the first to share something worth reading.</p>
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
    </div>
  );
}
