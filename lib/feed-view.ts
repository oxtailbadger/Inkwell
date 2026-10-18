import { parseView, sectionOfKind, type Section, type View } from "@/lib/sections";

// The feed page's tab/URL logic, with no React so it can be tested directly
// (this project has no DOM tests — see DECISIONS.md). FeedClient is a thin
// shell over these.

export type FeedFilters = { tag: string | null; saved: boolean; read: boolean; dismissed: boolean };

export const NO_FILTERS: FeedFilters = { tag: null, saved: false, read: false, dismissed: false };

type Params = { get(name: string): string | null };

// What the page URL says (?section=&tag=&saved=1&read=1&dismissed=1)
export function parseFeedUrl(params: Params): { view: View; section: Section; filters: FeedFilters } {
  const view = parseView(params.get("section"));
  return {
    view,
    // In the Authors view the feed keeps its default, so it is left untouched
    section: view === "authors" ? "all" : view,
    filters: {
      tag: params.get("tag"),
      saved: params.get("saved") === "1",
      read: params.get("read") === "1",
      dismissed: params.get("dismissed") === "1",
    },
  };
}

// The address shown for a view + filters. All is the bare /feed. Authors has no
// filters of its own, so none are written.
export function feedPath(view: View, filters: FeedFilters): string {
  const params = new URLSearchParams();
  if (view !== "all") params.set("section", view);
  if (view !== "authors") {
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.saved) params.set("saved", "1");
    if (filters.read) params.set("read", "1");
    if (filters.dismissed) params.set("dismissed", "1");
  }
  const qs = params.toString();
  return qs ? `/feed?${qs}` : "/feed";
}

// Picking a tab. The tag belongs to one list, so it is dropped; the
// Saved/Read/Dismissed toggles are per-user views you may want in several lists,
// so they carry over between feeds — but not back out of Authors, which has none.
export function viewAfterSwitch(
  current: { view: View; filters: FeedFilters },
  next: View
): { view: View; filters: FeedFilters } {
  if (next === current.view) return current;
  if (next === "authors" || current.view === "authors") return { view: next, filters: NO_FILTERS };
  return { view: next, filters: { ...current.filters, tag: null } };
}

// Query string for GET /api/articles. The section is always explicit: the API
// treats a missing one as Articles.
export function feedApiParams(section: Section, filters: FeedFilters, extra?: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams(extra);
  params.set("section", section);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.saved) params.set("saved", "1");
  if (filters.read) params.set("read", "1");
  if (filters.dismissed) params.set("dismissed", "1");
  return params;
}

// Should the feed be (re)fetched now? "skip" while on Authors (leave the list
// alone); "hydrated" when the server already rendered exactly this first page;
// otherwise "fetch".
export function feedFetchDecision(args: {
  view: View;
  section: Section;
  filters: FeedFilters;
  initial: { section: Section; filters: FeedFilters };
  stillHydrated: boolean;
}): "skip" | "hydrated" | "fetch" {
  const { view, section, filters, initial, stillHydrated } = args;
  if (view === "authors") return "skip";
  const same =
    section === initial.section &&
    filters.tag === initial.filters.tag &&
    filters.saved === initial.filters.saved &&
    filters.read === initial.filters.read &&
    filters.dismissed === initial.filters.dismissed;
  return stillHydrated && same ? "hydrated" : "fetch";
}

// After sharing: which list the new link landed in, if that isn't where you are.
// On All everything is in view, so there is nothing to announce.
export function filedNoticeFor(createdKind: string | null | undefined, section: Section): "articles" | "podcasts" | null {
  if (!createdKind || section === "all") return null;
  const filedIn = sectionOfKind(createdKind);
  return filedIn === section ? null : filedIn;
}
