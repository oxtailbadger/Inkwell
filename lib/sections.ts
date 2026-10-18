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
