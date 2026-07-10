"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Article } from "@/lib/articles";
import { getHostname } from "@/lib/url";

async function patchArticleState(articleId: string, action: string) {
  const res = await fetch("/api/article-state", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ article_id: articleId, action }),
  });
  if (!res.ok) throw new Error();
}

export function ArticleCard({
  article,
  onDelete,
  currentUserId,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onDismiss,
}: {
  article: Article;
  onDelete: (id: string) => void;
  currentUserId: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onDismiss: (id: string, title: string) => void;
}) {
  const [nodCount, setNodCount] = useState(article.nod_count);
  const [hasNodded, setHasNodded] = useState(article.user_has_nodded);
  const [nodding, setNodding] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const [saved, setSaved] = useState(article.saved);
  const [read, setRead] = useState(article.read);
  const menuRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);

  // Local state is an optimistic overlay between refetches; grid items keep
  // their key across refetches, so useState initial values alone go stale.
  // These only fire when a refetch actually delivers different values —
  // an in-flight optimistic toggle isn't clobbered, because a successful
  // toggle never changes the prop until the next fetch.
  useEffect(() => {
    setSaved(article.saved);
    setRead(article.read);
  }, [article.saved, article.read]);
  useEffect(() => {
    setNodCount(article.nod_count);
    setHasNodded(article.user_has_nodded);
  }, [article.nod_count, article.user_has_nodded]);

  const isOwner = article.submitted_by === currentUserId;
  const domain = getHostname(article.url) ?? "";

  // Publication badge: stored Microlink logo, else Google's favicon service
  // (covers pre-existing rows and manual-mode submissions), else the letter
  // monogram if the image 404s or the URL is unparseable
  const iconSrc =
    article.site_icon_url ??
    (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null);

  async function toggleNod() {
    if (nodding) return;
    setNodding(true);
    // Optimistic update
    setHasNodded((prev) => !prev);
    setNodCount((prev) => hasNodded ? prev - 1 : prev + 1);

    try {
      const res = await fetch("/api/nods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article_id: article.id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert on failure (non-OK response or network error)
      setHasNodded((prev) => !prev);
      setNodCount((prev) => hasNodded ? prev + 1 : prev - 1);
    } finally {
      setNodding(false);
    }
  }

  async function toggleSaved() {
    const next = !saved;
    setSaved(next);
    onCloseMenu();
    try {
      await patchArticleState(article.id, next ? "save" : "unsave");
    } catch {
      setSaved(!next);
    }
  }

  async function toggleRead() {
    const next = !read;
    setRead(next);
    onCloseMenu();
    try {
      await patchArticleState(article.id, next ? "read" : "unread");
    } catch {
      setRead(!next);
    }
  }

  // Close on outside click / Escape — only listens while this card's menu is
  // open. Escape hands focus back to the kebab button so keyboard users
  // aren't dropped at the document root.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onCloseMenu();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseMenu();
        kebabRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, onCloseMenu]);

  // Focus the first menu item when the menu opens (keyboard users arrive
  // via Enter/Space on the kebab and shouldn't have to Tab into the menu)
  useEffect(() => {
    if (menuOpen) {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [menuOpen]);

  // ArrowDown/ArrowUp cycle focus through the menu items
  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next].focus();
  }

  return (
    <div className="bg-card rounded-card border border-card-border overflow-hidden flex flex-col">
      <div className="relative">
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="block">
          {article.image_url ? (
            <div className="relative w-full h-[170px] bg-placeholder-bg">
              <Image
                src={article.image_url}
                alt={article.title ?? "Article image"}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="stripe-ph w-full h-[170px] bg-placeholder-bg" aria-hidden="true" />
          )}
        </a>

        {/* Kebab menu — a floating overlay on the image, not card chrome, so
            it uses one-off colors rather than paper/ink tokens */}
        <div ref={menuRef} className="absolute top-2.5 right-2.5">
          <button
            ref={kebabRef}
            onClick={onToggleMenu}
            aria-label="Article actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center text-[16px] leading-none text-[#fffdfa] bg-[rgba(23,19,15,.55)] border border-[rgba(255,253,250,.5)] backdrop-blur-[3px]"
          >
            ⋮
          </button>
          {menuOpen && (
            <div
              role="menu"
              aria-label="Article actions"
              onKeyDown={onMenuKeyDown}
              className="absolute top-[calc(100%+4px)] right-0 min-w-[160px] bg-card border border-card-border rounded-[10px] overflow-hidden shadow-[0_6px_18px_rgba(23,19,15,.14)] z-10"
            >
              <button
                role="menuitem"
                onClick={toggleSaved}
                className={`w-full text-left flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium border-b border-card-border transition-colors ${
                  saved ? "bg-accent-tint text-accent" : "text-ink hover:bg-tag-bg"
                }`}
              >
                🔖 {saved ? "Saved" : "Save"}
              </button>
              <button
                role="menuitem"
                onClick={toggleRead}
                className={`w-full text-left flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium border-b border-card-border transition-colors ${
                  read ? "bg-tag-bg text-ink" : "text-ink hover:bg-tag-bg"
                }`}
              >
                ✓ {read ? "Mark unread" : "Mark read"}
              </button>
              <button
                role="menuitem"
                onClick={() => onDismiss(article.id, article.title ?? article.url)}
                className="w-full text-left flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium text-danger hover:bg-tag-bg transition-colors"
              >
                ✕ Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="px-[22px] pt-[22px] pb-[22px] flex flex-col flex-1">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.25 min-w-0">
            <div
              className="flex-none w-5 h-5 rounded-badge-sm bg-ink text-paper flex items-center justify-center overflow-hidden text-[11px] font-semibold"
              aria-hidden="true"
            >
              {iconSrc && !iconFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconSrc}
                  alt=""
                  width={20}
                  height={20}
                  className="w-full h-full object-contain"
                  onError={() => setIconFailed(true)}
                />
              ) : (
                (article.site_name ?? domain).charAt(0).toUpperCase()
              )}
            </div>
            <span className="text-xs font-display font-semibold uppercase tracking-[0.08em] text-muted truncate">
              {article.site_name ?? domain}
            </span>
            {saved && (
              <span className="flex-none text-[10px] font-semibold bg-accent-tint text-accent rounded-badge-sm px-1.5 py-0.5">
                {read ? "Saved · Read" : "Saved"}
              </span>
            )}
          </div>
          {isOwner && (
            <button
              onClick={() => onDelete(article.id)}
              className="flex-none text-xs text-danger hover:opacity-75 transition-opacity"
            >
              Remove
            </button>
          )}
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-headline font-semibold text-ink hover:text-accent mb-2"
        >
          {article.title ?? article.url}
        </a>
        {article.description && (
          <p className="text-body-sm text-muted line-clamp-2 mb-3.5">{article.description}</p>
        )}
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-[7px] mb-4">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-semibold uppercase tracking-wider font-display bg-tag-bg text-tag-fg border border-tag-border rounded-tag px-[9px] py-[3px]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-3.5 border-t border-card-border flex items-center justify-between flex-wrap gap-y-2">
          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleNod}
              disabled={nodding}
              aria-pressed={hasNodded}
              className={`flex items-center gap-1.5 text-[12.5px] font-semibold rounded-control px-3 py-1.5 border transition-colors ${
                hasNodded
                  ? "bg-accent-tint border-accent text-accent"
                  : "bg-card border-card-border text-muted"
              }`}
            >
              <span>{hasNodded ? "✦" : "✧"}</span>
              <span>
                {hasNodded ? "Nodded" : "Nod"}
                {nodCount > 0 ? ` · ${nodCount}` : ""}
              </span>
            </button>
            {article.archive_url && (
              <a
                href={article.archive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11.5px] font-semibold tracking-[0.02em] text-accent border-b border-accent"
              >
                Read free ↗
              </a>
            )}
          </div>
          <p className="text-xs font-display text-muted-2 flex items-center">
            {read && !saved && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent mr-1.5" aria-hidden="true" />
            )}
            {isOwner ? "You" : article.submitter_name ?? "Friend"} · {new Date(article.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
