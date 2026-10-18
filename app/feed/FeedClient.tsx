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
import { apiFetch, goToLogin } from "@/lib/api-client";
import { createLatestGuard } from "@/lib/latest";
import { SECTIONS, SECTION_LABEL, parseSection, sectionOfKind, type Section } from "@/lib/sections";

const DISMISS_TOAST_MS = 4500;

// Per-section wording for headings and empty states
const SECTION_COPY: Record<Section, { heading: string; noun: string; nouns: string; icon: string; emptyHint: string }> = {
  all: {
    heading: "Shared by your friends",
    noun: "link",
    nouns: "links",
    icon: "📰",
    emptyHint: "Be the first to share something worth reading or hearing.",
  },
  articles: {
    heading: "Articles from your friends",
    noun: "article",
    nouns: "articles",
    icon: "📰",
    emptyHint: "Be the first to share something worth reading.",
  },
  podcasts: {
    heading: "Podcasts from your friends",
    noun: "podcast",
    nouns: "podcasts",
    icon: "🎧",
    emptyHint: "Share a link from Apple Podcasts or Spotify and it lands here.",
  },
};

export default function FeedClient({
  userEmail,
  userId,
  displayName,
  initialArticles,
  initialNextCursor,
  initialSection,
  initialTag,
  initialSavedOnly,
  initialReadOnly,
  initialDismissedOnly,
  initialAllTags,
  initialError,
}: {
  userEmail: string;
  userId: string;
  displayName: string;
  initialArticles: Article[];
  initialNextCursor: string | null;
  initialSection: Section;
  initialTag: string | null;
  initialSavedOnly: boolean;
  initialReadOnly: boolean;
  initialDismissedOnly: boolean;
  initialAllTags: string[];
  initialError: string | null;
}) {
  const searchParams = useSearchParams();
  // Tag + saved/read/dismissed filters all live in the URL so filtered
  // views are shareable and survive reloads
  const section = parseSection(searchParams.get("section"));
  const copy = SECTION_COPY[section];
  const activeTag = searchParams.get("tag");
  const savedOnly = searchParams.get("saved") === "1";
  const readOnly = searchParams.get("read") === "1";
  const dismissedOnly = searchParams.get("dismissed") === "1";
  // Set by /share (Web Share Target); captured once — SubmitArticle seeds
  // its state from the first value, and we scrub it from the URL below.
  // Lazy useState (not useRef(...).current): same "read once at mount"
  // semantics, without reading a ref during render.
  const [sharedUrl] = useState(() => searchParams.get("share"));

  useEffect(() => {
    if (sharedUrl) window.history.replaceState(null, "", "/feed");
  }, [sharedUrl]);
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  // True once the Authors block has scrolled past the middle of the screen
  const [atAuthors, setAtAuthors] = useState(false);
  // "Added to Podcasts" after sharing a link that was filed in the other section
  const [filedNotice, setFiledNotice] = useState<"articles" | "podcasts" | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(initialError);
  // The first render is already populated by the server; only refetch after
  // that when the tag changes or a submission triggers a reload
  const hydratedFromServer = useRef(true);
  // Responses can arrive out of order: click tag A (slow) then tag B (fast) and
  // A's answer used to land last and overwrite B's. Only the latest full load —
  // and any "load more" that belongs to it — may update the screen.
  const [latest] = useState(() => createLatestGuard());

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

  // Shared by loadArticles/loadMore below — builds the query string from
  // whatever combination of tag/saved/read/dismissed is currently active
  // (saved/read/dismissed are independent toggles, ANDed together, not
  // mutually exclusive with each other or with the tag filter)
  const activeFilterParams = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams(extra);
      // Always explicit: the API treats a missing section as Articles
      params.set("section", section);
      if (activeTag) params.set("tag", activeTag);
      if (savedOnly) params.set("saved", "1");
      if (readOnly) params.set("read", "1");
      if (dismissedOnly) params.set("dismissed", "1");
      return params;
    },
    [section, activeTag, savedOnly, readOnly, dismissedOnly]
  );

  // Full-list replace (initial load, tag change, post-submit refresh) — not
  // to be confused with loadMore() below, which appends instead of replacing
  const loadArticles = useCallback(async () => {
    const token = latest.next(); // also invalidates any older load or "load more"
    setLoading(true);
    setLoadingMore(false);
    setFeedError(null);
    try {
      const qs = activeFilterParams().toString();
      const res = await apiFetch(qs ? `/api/articles?${qs}` : "/api/articles");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load articles");
      if (!latest.isCurrent(token)) return; // a newer filter was chosen meanwhile
      setArticles(Array.isArray(data.articles) ? data.articles : []);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      if (!latest.isCurrent(token)) return;
      setFeedError(`Could not load articles: ${e instanceof Error ? e.message : "network error"}`);
      setArticles([]);
      setNextCursor(null);
    } finally {
      // Only the latest request owns the spinner; a stale one finishing must not
      // switch it off while the newer one is still loading
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [activeFilterParams, latest]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    // The cursor belongs to the filters that produced it. If the filters change
    // while this is in flight, its page of results is for the wrong list.
    const token = latest.current();
    setLoadingMore(true);
    setFeedError(null);
    try {
      const params = activeFilterParams({ cursor: nextCursor });
      const res = await apiFetch(`/api/articles?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load more articles");
      if (!latest.isCurrent(token)) return;
      setArticles((prev) => [...prev, ...(Array.isArray(data.articles) ? data.articles : [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      if (!latest.isCurrent(token)) return;
      setFeedError(`Could not load more articles: ${e instanceof Error ? e.message : "network error"}`);
    } finally {
      if (latest.isCurrent(token)) setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (
      hydratedFromServer.current &&
      section === initialSection &&
      activeTag === initialTag &&
      savedOnly === initialSavedOnly &&
      readOnly === initialReadOnly &&
      dismissedOnly === initialDismissedOnly
    ) {
      hydratedFromServer.current = false;
      return;
    }
    hydratedFromServer.current = false;
    loadArticles();
  }, [loadArticles, section, initialSection, activeTag, initialTag, savedOnly, initialSavedOnly, readOnly, initialReadOnly, dismissedOnly, initialDismissedOnly]);

  // Shallow history update: syncs useSearchParams without a server round-trip
  // (the tag-change effect below does the client-side fetch). Any filter not
  // named in `overrides` keeps its current value.
  function updateFilters(overrides: { section?: Section; tag?: string | null; saved?: boolean; read?: boolean; dismissed?: boolean }) {
    const params = new URLSearchParams();
    const nextSection = overrides.section !== undefined ? overrides.section : section;
    if (nextSection !== "all") params.set("section", nextSection);
    const nextTag = overrides.tag !== undefined ? overrides.tag : activeTag;
    const nextSaved = overrides.saved !== undefined ? overrides.saved : savedOnly;
    const nextRead = overrides.read !== undefined ? overrides.read : readOnly;
    const nextDismissed = overrides.dismissed !== undefined ? overrides.dismissed : dismissedOnly;
    if (nextTag) params.set("tag", nextTag);
    if (nextSaved) params.set("saved", "1");
    if (nextRead) params.set("read", "1");
    if (nextDismissed) params.set("dismissed", "1");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/feed?${qs}` : "/feed");
  }

  // Switching section keeps the Saved/Read/Dismissed toggles (they're per-user
  // views you may want in both) but drops the tag, which belongs to one list
  function switchSection(next: Section) {
    // From the Authors block, even re-picking the current section means "take me back up"
    if (atAuthors) document.getElementById("articles")?.scrollIntoView();
    if (next === section) return;
    setFiledNotice(null);
    updateFilters({ section: next, tag: null });
  }
  // Articles and Podcasts switch the list; Authors scrolls to its block below it
  const navItems: { key: string; label: string; active: boolean; section?: Section; href?: string }[] = [
    ...SECTIONS.map((id) => ({ key: id, label: SECTION_LABEL[id], section: id, active: !atAuthors && section === id })),
    { key: "authors", label: "Authors", href: "#authors", active: atAuthors },
  ];
  function setActiveTag(tag: string | null) {
    updateFilters({ tag });
  }
  function toggleSavedOnly() {
    updateFilters({ saved: !savedOnly });
  }
  function toggleReadOnly() {
    updateFilters({ read: !readOnly });
  }
  function toggleDismissedOnly() {
    updateFilters({ dismissed: !dismissedOnly });
  }
  // Used by each empty-state's "Show all" link — clears every
  // state-view toggle at once rather than just the one that's active,
  // since more than one can be on together
  function clearStateFilters() {
    updateFilters({ saved: false, read: false, dismissed: false });
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
        setAtAuthors(authors.getBoundingClientRect().top <= midpoint);
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
      const res = await apiFetch(`/api/articles?id=${id}`, { method: "DELETE" });
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
    apiFetch("/api/article-state", {
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
    apiFetch("/api/article-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article_id: toast.articleId, action: "undismiss" }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => setFeedError("Could not undo the dismiss. Please try again."));
  }

  // Restoring a previously-dismissed article, from the Dismissed view's kebab
  // menu — distinct from Undo above (which reverses a *just-now* dismiss
  // within the toast window). No toast/undo grace period here: restoring is
  // the corrective action, not the destructive one, so it commits directly.
  function handleRestore(id: string) {
    setOpenMenuId(null);
    if (dismissedOnly) setCollapsedIds((prev) => new Set(prev).add(id));

    apiFetch("/api/article-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article_id: id, action: "undismiss" }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        if (dismissedOnly) {
          setCollapsedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
        setFeedError("Could not restore the article. Please try again.");
      });
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    goToLogin();
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
            {navItems.map(({ key, label, active, section: target, href }) => {
              const cls = `flex w-full items-center gap-2 px-3 py-2 rounded-control text-sm font-medium transition-colors text-left ${
                active ? "bg-accent-tint text-accent" : "text-muted hover:bg-tag-bg hover:text-ink"
              }`;
              return target ? (
                <button key={key} onClick={() => switchSection(target)} aria-current={active ? "page" : undefined} className={cls}>
                  {label}
                </button>
              ) : (
                <a key={key} href={href} aria-current={active ? "page" : undefined} className={cls}>
                  {label}
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 space-y-10">
          <section id="articles" className="space-y-6 scroll-mt-20">
            <SubmitArticle
              onSubmitted={(created) => {
                const filedIn = sectionOfKind(created?.kind);
                // Only say so when it landed somewhere other than where you are
                setFiledNotice(created?.kind && section !== "all" && filedIn !== section ? filedIn : null);
                loadArticles();
              }}
              initialUrl={sharedUrl ?? undefined}
            />
            {filedNotice && (
              <p role="status" className="text-sm text-ink bg-accent-tint border border-accent rounded-control px-4 py-2.5 flex items-center justify-between gap-3">
                <span>Added to {SECTION_LABEL[filedNotice]}.</span>
                <button onClick={() => switchSection(filedNotice)} className="font-semibold text-accent border-b border-accent">
                  View
                </button>
              </p>
            )}

            {/* Independent of the tag filter below and of each other — all
                AND'd together, not mutually exclusive, so e.g. "Saved" + a
                tag can be active at once */}
            <div className="flex flex-wrap gap-2">
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
              <button
                onClick={toggleReadOnly}
                aria-pressed={readOnly}
                className={`inline-flex items-center gap-1.5 text-[13px] font-medium rounded-control px-3.5 py-1.5 border transition-colors ${
                  readOnly
                    ? "bg-accent-tint border-accent text-accent"
                    : "bg-transparent border-card-border text-ink hover:border-ink"
                }`}
              >
                ✓ Read
              </button>
              <button
                onClick={toggleDismissedOnly}
                aria-pressed={dismissedOnly}
                className={`inline-flex items-center gap-1.5 text-[13px] font-medium rounded-control px-3.5 py-1.5 border transition-colors ${
                  dismissedOnly
                    ? "bg-accent-tint border-accent text-accent"
                    : "bg-transparent border-card-border text-ink hover:border-ink"
                }`}
              >
                ✕ Dismissed
              </button>
            </div>

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

            <h2 className="inline-block text-sm font-display font-semibold uppercase tracking-widest text-accent border-b-2 border-accent pb-1">{copy.heading}</h2>

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
                <p className="text-4xl mb-3">{copy.icon}</p>
                {savedOnly ? (
                  <>
                    <p className="font-medium text-ink">No saved {copy.nouns} yet</p>
                    <p className="text-sm mt-1">Use the ⋮ menu on a card to save it for later.</p>
                    <button
                      onClick={clearStateFilters}
                      className="text-sm mt-1 text-accent border-b border-accent"
                    >
                      Show all {copy.nouns}
                    </button>
                  </>
                ) : readOnly ? (
                  <>
                    <p className="font-medium text-ink">No read {copy.nouns} yet</p>
                    <p className="text-sm mt-1">Mark {copy.noun === "podcast" ? "a podcast" : copy.noun === "link" ? "a link" : "an article"} read from its ⋮ menu.</p>
                    <button
                      onClick={clearStateFilters}
                      className="text-sm mt-1 text-accent border-b border-accent"
                    >
                      Show all {copy.nouns}
                    </button>
                  </>
                ) : dismissedOnly ? (
                  <>
                    <p className="font-medium text-ink">Nothing dismissed</p>
                    <p className="text-sm mt-1">{copy.nouns.charAt(0).toUpperCase() + copy.nouns.slice(1)} you dismiss show up here so you can bring them back.</p>
                    <button
                      onClick={clearStateFilters}
                      className="text-sm mt-1 text-accent border-b border-accent"
                    >
                      Show all {copy.nouns}
                    </button>
                  </>
                ) : activeTag ? (
                  <>
                    <p className="font-medium text-ink">No {copy.nouns} tagged yet</p>
                    <button
                      onClick={() => setActiveTag(null)}
                      className="text-sm mt-1 text-accent border-b border-accent"
                    >
                      Show all {copy.nouns}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-ink">No {copy.nouns} yet</p>
                    <p className="text-sm mt-1">{copy.emptyHint}</p>
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
                          showKind={section === "all"}
                          onDelete={handleDelete}
                          currentUserId={userId}
                          menuOpen={openMenuId === article.id}
                          onToggleMenu={() => setOpenMenuId((prev) => (prev === article.id ? null : article.id))}
                          onCloseMenu={() => setOpenMenuId(null)}
                          onDismiss={handleDismiss}
                          onUndismiss={handleRestore}
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
        {navItems.map(({ key, label, active, section: target, href }) => {
          const cls = `flex-1 py-3 text-center text-sm font-medium transition-colors ${
            active ? "text-accent border-t-2 border-accent -mt-px" : "text-muted"
          }`;
          return target ? (
            <button key={key} onClick={() => switchSection(target)} aria-current={active ? "page" : undefined} className={cls}>
              {label}
            </button>
          ) : (
            <a key={key} href={href} aria-current={active ? "page" : undefined} className={cls}>
              {label}
            </a>
          );
        })}
      </nav>

      <ToastStack toasts={toasts} onUndo={handleUndoDismiss} />
    </div>
  );
}
