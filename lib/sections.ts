// The feed's sections. Which section a link belongs to is decided by Postgres
// (articles.kind, filled by a trigger from the URL — supabase/sections.sql); the
// app only chooses which section to LOOK at.
export type Section = "articles" | "podcasts";

export const SECTIONS: readonly Section[] = ["articles", "podcasts"];

export const SECTION_LABEL: Record<Section, string> = {
  articles: "Articles",
  podcasts: "Podcasts",
};

// articles.kind value for each section
export const SECTION_KIND: Record<Section, "article" | "podcast"> = {
  articles: "article",
  podcasts: "podcast",
};

export function isSection(value: unknown): value is Section {
  return typeof value === "string" && (SECTIONS as readonly string[]).includes(value);
}

// Lenient (page URLs): anything unrecognised is the default section.
export function parseSection(value: string | null | undefined): Section {
  return isSection(value) ? value : "articles";
}

// The section a row lives in, from its kind
export function sectionOfKind(kind: string | null | undefined): Section {
  return kind === "podcast" ? "podcasts" : "articles";
}
