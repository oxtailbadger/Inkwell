// The feed's sections. Which kind a link is (article or podcast) is decided by
// Postgres (articles.kind, filled by a trigger from the URL —
// supabase/sections.sql); the app only chooses which list to LOOK at. "all" is
// both kinds mixed, newest first, and is the default view.
export type Section = "all" | "articles" | "podcasts";

export const SECTIONS: readonly Section[] = ["all", "articles", "podcasts"];

export const SECTION_LABEL: Record<Section, string> = {
  all: "All",
  articles: "Articles",
  podcasts: "Podcasts",
};

export function isSection(value: unknown): value is Section {
  return typeof value === "string" && (SECTIONS as readonly string[]).includes(value);
}

// Lenient (page URLs): anything unrecognised is the default view.
export function parseSection(value: string | null | undefined): Section {
  return isSection(value) ? value : "all";
}

// The list a row lives in, from its kind (never "all")
export function sectionOfKind(kind: string | null | undefined): "articles" | "podcasts" {
  return kind === "podcast" ? "podcasts" : "articles";
}

// What the feed page is showing: one of the sections above, or the curated
// Authors list (a separate view, not a kind of shared link — the API and the
// database know nothing about it). Lives in the same ?section= URL param.
export type View = Section | "authors";

export const VIEWS: readonly View[] = [...SECTIONS, "authors"];

export const VIEW_LABEL: Record<View, string> = { ...SECTION_LABEL, authors: "Authors" };

export function parseView(value: string | null | undefined): View {
  return value === "authors" ? "authors" : parseSection(value);
}
