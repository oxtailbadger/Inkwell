"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArticleCard } from "@/components/ArticleCard";
import { SubmitArticle } from "@/components/SubmitArticle";
import { QuillIcon } from "@/components/QuillIcon";
import { AuthorFeed } from "@/components/AuthorFeed";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastStack, type ToastItem } from "@/components/Toast";
import type { Article } from "@/lib/articles";

const DISMISS_TOAST_MS = 4500;

const NAV_ITEMS = [
  { label: "Articles", href: "#articles" },
  { label: "Authors", href: "#authors" },
];

export default function FeedClient({
  userEmail,
  userId,
  displayName,
  initialArticles,
  initialNextCursor,
  initialTag,
  initialSavedOnly,
  initialAllTags,
  initialError,
}: {
  userEmail: string;
  userId: string;
  displayName: string;
  initialArticles: Article[];
  initialNextCursor: string | null;
  initialTag: string | null;
  initialSavedOnly: boolean;
  initialAllTags: string[];
  initialError: string | null;
}) {
  const searchParams = useSearchParams();
  // Tag + saved filters live in the URL so filtered views are shareable and survive reloads
  const activeTag = searchParams.get("tag");
  const savedOnly = searchParams.get("saved") === "1";
  // Set by /share (Web Share Target); captured once — SubmitArticle seeds
  // its state from the first value, and we scrub it from the URL below
  const sharedUrl = useRef(searchParams.get("share")).current;

  useEffect(() => {
    if (sharedUrl) window.history.replaceState(null, "", "/feed");
  }, [sharedUrl]);
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeSection, setActiveSection] = useState("articles");
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(initialError);
  // The first render is already populated by the server; only refetch after
  // that when the tag changes or a submission triggers a reload
  const hydratedFromServer = useRef(true);

  // Save/Read/Dismiss: only one card's kebab menu open at a time, app-wide
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Dismissed-but-not-yet-undone articles stay in `articles` and just render
  // collapsed — never spliced out mid-session (avoids reorder-on-undo bugs).
  // The server excludes them from the *next* full fetch instead.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Clear pending toast timers on unmount so they can't fire setState
  // against an unmounted component
  useEffect(() => {
    const timers = dismissTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // Full-list replace (initial load, tag change, post-submit refresh) — not
  // to be confused with loadMore() below, which appends instead of replacing
  const loadArticles = useCallback(async () => {
    setLoading(true);
    setFeedError(null);
    try {
      const params = new URLSearchParams();
      if (activeTag) params.set("tag", activeTag);
      if (savedOnly) params.set("saved", "1");
      const qs = params.toString();
      const res = await fetch(qs ? `/api/articles?${qs}` : "/api/articles");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load articles");
      setArticles(Array.isArray(data.articles) ? data.articles : []);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setFeedError(`Could not load articles: ${e instanceof Error ? e.message : "network error"}`);
      setArticles([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [activeTag, savedOnly]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setFeedError(null);
    try {
      const params = new URLSearchParams({ cursor: nextCursor });
      if (activeTag) params.set("tag", activeTag);
      if (savedOnly) params.set("saved", "1");
      const res = await fetch(`/api/articles?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load more articles");
      setArticles((prev) => [...prev, ...(Array.isArray(data.articles) ? data.articles : [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      setFeedError(`Could not load more articles: ${e instanceof Error ? e.message : "network error"}`);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (hydratedFromServer.current && activeTag === initialTag && savedOnly === initialSavedOnly) {
      hydratedFromServer.current = false;
      return;
    }
    hydratedFromServer.current = false;
    loadArticles();
  }, [loadArticles, activeTag, initialTag, savedOnly, initialSavedOnly]);

  // Shallow history update: syncs useSearchParams without a server round-trip
  // (the tag-change effect below does the client-side fetch)
  function setActiveTag(tag: string | null) {
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (savedOnly) params.set("saved", "1");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/feed?${qs}` : "/feed");
  }

  // Independent of the tag filter — AND'd together, not mutually exclusive
  function toggleSavedOnly() {
    const params = new URLSearchParams();
    if (activeTag) params.set("tag", activeTag);
    if (!savedOnly) params.set("saved", "1");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/feed?${qs}` : "/feed");
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

  function handleDismiss(id: string, title: string) {
    setOpenMenuId(null);
    setCollapsedIds((prev) => new Set(prev).add(id));

    // Commit immediately (not delayed) — an in-memory delayed-commit could
    // fire on a different serverless instance than the one that handles the
    // eventual Undo click, or be lost on a cold start. The toast's timer
    // only controls the UI window for showing Undo, not whether the write
    // already happened. fetch only rejects on network errors, so a server
    // rejection (non-OK status) has to be thrown explicitly or the revert
    // below never runs.
    fetch("/api/article-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article_id: id, action: "dismiss" }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        // Revert the collapse if the write failed
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setFeedError("Could not dismiss the article. Please try again.");
      });

    const toastId = `${id}-${Date.now()}`;
    const timer = setTimeout(() => {
      dismissTimers.current.delete(toastId);
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, DISMISS_TOAST_MS);
    dismissTimers.current.set(toastId, timer);
    setToasts((prev) => [...prev, { id: toastId, message: `Dismissed "${title}"`, articleId: id }]);
  }

  function handleUndoDismiss(toastId: string) {
    const toast = toasts.find((t) => t.id === toastId);
    if (!toast) return;
    const timer = dismissTimers.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      dismissTimers.current.delete(toastId);
    }
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.delete(toast.articleId);
      return next;
    });
    fetch("/api/article-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article_id: toast.articleId, action: "undismiss" }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => setFeedError("Could not undo the dismiss. Please try again."));
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // Server-provided full tag list (pagination means the loaded page alone
  // no longer covers every tag), unioned with tags from currently loaded
  // articles so a just-submitted article's new tag appears without a reload
  const allTags = [...new Set([...initialAllTags, ...articles.flatMap((a) => a.tags)])].sort();

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-paper border-b border-card-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QuillIcon className="w-6 h-6" />
            <h1 className="text-xl font-bold text-ink tracking-[-0.01em]">Inkwell</h1>
            <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" aria-hidden="true" />
            <span className="text-sm font-display text-muted-2 hidden sm:block ml-1">A place to share ideas</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/profile"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <span
                className="flex-none w-7 h-7 rounded-full bg-ink text-paper flex items-center justify-center text-xs font-semibold"
                aria-hidden="true"
              >
                {displayName.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm text-muted hidden sm:block">{userEmail}</span>
            </Link>
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

            {/* Independent of the tag filter below — AND'd together, not
                mutually exclusive, so "Saved" + a tag can be active at once */}
            <button
              onClick={toggleSavedOnly}
              aria-pressed={savedOnly}
              className={`inline-flex items-center gap-1.5 text-[13px] font-medium rounded-control px-3.5 py-1.5 border transition-colors ${
                savedOnly
                  ? "bg-accent-tint border-accent text-accent"
                  : "bg-transparent border-card-border text-ink hover:border-ink"
              }`}
            >
              🔖 Saved
            </button>

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

            <h2 className="inline-block text-sm font-display font-semibold uppercase tracking-widest text-accent border-b-2 border-accent pb-1">Articles from your friends</h2>

            {feedError && (
              <div className="rounded-control bg-danger-tint border border-danger-border px-4 py-3 text-sm text-danger">
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
                {savedOnly ? (
                  <>
                    <p className="font-medium text-ink">No saved articles yet</p>
                    <p className="text-sm mt-1">Use the ⋮ menu on a card to save it for later.</p>
                    <button
                      onClick={toggleSavedOnly}
                      className="text-sm mt-1 text-accent border-b border-accent"
                    >
                      Show all articles
                    </button>
                  </>
                ) : activeTag ? (
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
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {articles.map((article) => {
                    const collapsed = collapsedIds.has(article.id);
                    return (
                      <div
                        key={article.id}
                        style={{
                          transition: "opacity 320ms ease, transform 320ms ease, max-height 320ms ease, margin 320ms ease",
                          opacity: collapsed ? 0 : 1,
                          transform: collapsed ? "scale(0.96)" : "scale(1)",
                          maxHeight: collapsed ? "0px" : "1000px",
                          overflow: collapsed ? "hidden" : undefined,
                          pointerEvents: collapsed ? "none" : undefined,
                        }}
                      >
                        <ArticleCard
                          article={article}
                          onDelete={handleDelete}
                          currentUserId={userId}
                          menuOpen={openMenuId === article.id}
                          onToggleMenu={() => setOpenMenuId((prev) => (prev === article.id ? null : article.id))}
                          onCloseMenu={() => setOpenMenuId(null)}
                          onDismiss={handleDismiss}
                        />
                      </div>
                    );
                  })}
                </div>
                {nextCursor && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="text-[13px] font-semibold text-ink bg-transparent border border-card-border rounded-control px-4 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  </div>
                )}
              </>
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

      <ToastStack toasts={toasts} onUndo={handleUndoDismiss} />
    </div>
  );
}
