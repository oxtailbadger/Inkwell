import { describe, it, expect } from "vitest";
import {
  NO_FILTERS,
  feedApiParams,
  feedFetchDecision,
  feedPath,
  filedNoticeFor,
  parseFeedUrl,
  viewAfterSwitch,
  type FeedFilters,
} from "@/lib/feed-view";
import { VIEWS, type View } from "@/lib/sections";

// The feed page's tab logic (lib/feed-view.ts). FeedClient is a thin shell over
// it, so the behaviour users see — which tab is active, what the URL says, what
// gets fetched — is pinned here without rendering anything.

const q = (s: string) => new URLSearchParams(s);
const f = (o: Partial<FeedFilters> = {}): FeedFilters => ({ ...NO_FILTERS, ...o });

describe("parseFeedUrl", () => {
  it("/feed is the All view with no filters", () => {
    expect(parseFeedUrl(q(""))).toEqual({ view: "all", section: "all", filters: NO_FILTERS });
  });

  it.each(["all", "articles", "podcasts"] as const)("?section=%s selects that feed", (v) => {
    const r = parseFeedUrl(q(`section=${v}`));
    expect(r.view).toBe(v);
    expect(r.section).toBe(v);
  });

  it("?section=authors is the Authors view, and the feed section stays at its default", () => {
    const r = parseFeedUrl(q("section=authors"));
    expect(r.view).toBe("authors");
    expect(r.section).toBe("all"); // so the feed's own state isn't disturbed
  });

  it.each(["videos", "", "PODCASTS", "authors,all", "constructor"])("an unrecognised section %j is All", (v) => {
    expect(parseFeedUrl(q(`section=${encodeURIComponent(v)}`)).view).toBe("all");
  });

  it("reads tag and the three state toggles; only '1' turns a toggle on", () => {
    expect(parseFeedUrl(q("tag=tech&saved=1&read=1&dismissed=1")).filters).toEqual({ tag: "tech", saved: true, read: true, dismissed: true });
    expect(parseFeedUrl(q("saved=true&read=0&dismissed=")).filters).toEqual(NO_FILTERS);
  });
});

describe("feedPath", () => {
  it("All with nothing selected is the bare /feed", () => {
    expect(feedPath("all", NO_FILTERS)).toBe("/feed");
  });

  it("names the section for every view except All", () => {
    expect(feedPath("articles", NO_FILTERS)).toBe("/feed?section=articles");
    expect(feedPath("podcasts", NO_FILTERS)).toBe("/feed?section=podcasts");
    expect(feedPath("authors", NO_FILTERS)).toBe("/feed?section=authors");
  });

  it("writes the filters for a feed", () => {
    expect(feedPath("podcasts", f({ tag: "tech", saved: true, read: true, dismissed: true }))).toBe(
      "/feed?section=podcasts&tag=tech&saved=1&read=1&dismissed=1"
    );
    expect(feedPath("all", f({ saved: true }))).toBe("/feed?saved=1");
  });

  it("never writes filters for Authors, which has none", () => {
    expect(feedPath("authors", f({ tag: "tech", saved: true }))).toBe("/feed?section=authors");
  });

  it("round-trips through parseFeedUrl for every view", () => {
    const filters = f({ tag: "politics", read: true });
    for (const view of VIEWS) {
      const path = feedPath(view, filters);
      const parsed = parseFeedUrl(new URL(path, "https://x.test").searchParams);
      expect(parsed.view).toBe(view);
      expect(parsed.filters).toEqual(view === "authors" ? NO_FILTERS : filters);
    }
  });

  it("encodes a tag that contains URL syntax", () => {
    const path = feedPath("all", f({ tag: "a&b=c d" }));
    expect(parseFeedUrl(new URL(path, "https://x.test").searchParams).filters.tag).toBe("a&b=c d");
  });
});

describe("viewAfterSwitch (clicking a tab)", () => {
  const withFilters = f({ tag: "tech", saved: true, read: true });

  it("re-clicking the current tab changes nothing", () => {
    const cur = { view: "podcasts" as View, filters: withFilters };
    expect(viewAfterSwitch(cur, "podcasts")).toBe(cur);
  });

  it("between feeds: the tag is dropped, Saved/Read/Dismissed carry over", () => {
    expect(viewAfterSwitch({ view: "all", filters: withFilters }, "podcasts")).toEqual({
      view: "podcasts",
      filters: f({ saved: true, read: true }),
    });
    expect(viewAfterSwitch({ view: "articles", filters: withFilters }, "all").filters.tag).toBeNull();
  });

  it("into Authors: every filter is cleared (it has none)", () => {
    expect(viewAfterSwitch({ view: "articles", filters: withFilters }, "authors")).toEqual({ view: "authors", filters: NO_FILTERS });
  });

  it("out of Authors: the feed starts fresh", () => {
    expect(viewAfterSwitch({ view: "authors", filters: NO_FILTERS }, "podcasts")).toEqual({ view: "podcasts", filters: NO_FILTERS });
  });

  it("the resulting URL is what the user lands on", () => {
    const to = viewAfterSwitch({ view: "all", filters: f({ tag: "tech", saved: true }) }, "podcasts");
    expect(feedPath(to.view, to.filters)).toBe("/feed?section=podcasts&saved=1");
  });

  it("every ordered pair of tabs lands on the tab that was clicked", () => {
    for (const from of VIEWS) for (const to of VIEWS) {
      expect(viewAfterSwitch({ view: from, filters: withFilters }, to).view).toBe(to);
    }
  });
});

describe("feedApiParams (what the feed asks the API for)", () => {
  it("always names the section — the API treats a missing one as Articles", () => {
    for (const s of ["all", "articles", "podcasts"] as const) {
      expect(feedApiParams(s, NO_FILTERS).get("section")).toBe(s);
    }
  });

  it("adds only the filters that are on", () => {
    expect(feedApiParams("all", NO_FILTERS).toString()).toBe("section=all");
    const p = feedApiParams("podcasts", f({ tag: "tech", saved: true, dismissed: true }));
    expect(Object.fromEntries(p)).toEqual({ section: "podcasts", tag: "tech", saved: "1", dismissed: "1" });
  });

  it("keeps the cursor for load-more", () => {
    expect(feedApiParams("articles", NO_FILTERS, { cursor: "abc" }).get("cursor")).toBe("abc");
  });

  it("the section can't be overridden by the extras", () => {
    expect(feedApiParams("podcasts", NO_FILTERS, { section: "articles" }).get("section")).toBe("podcasts");
  });
});

describe("feedFetchDecision (when to hit the API)", () => {
  const initial = { section: "all" as const, filters: NO_FILTERS };
  const base = { view: "all" as View, section: "all" as const, filters: NO_FILTERS, initial, stillHydrated: true };

  it("on first render the server's page is used as-is", () => {
    expect(feedFetchDecision(base)).toBe("hydrated");
  });

  it("not hydrated any more: fetch (e.g. after the server page was consumed)", () => {
    expect(feedFetchDecision({ ...base, stillHydrated: false })).toBe("fetch");
  });

  it.each([
    ["a different section", { section: "podcasts" as const, view: "podcasts" as View }],
    ["a tag", { filters: f({ tag: "tech" }) }],
    ["Saved", { filters: f({ saved: true }) }],
    ["Read", { filters: f({ read: true }) }],
    ["Dismissed", { filters: f({ dismissed: true }) }],
  ])("%s differs from what the server rendered: fetch", (_n, change) => {
    expect(feedFetchDecision({ ...base, ...change })).toBe("fetch");
  });

  it("Authors never fetches, whatever else is true", () => {
    expect(feedFetchDecision({ ...base, view: "authors" })).toBe("skip");
    expect(feedFetchDecision({ ...base, view: "authors", stillHydrated: false })).toBe("skip");
    expect(feedFetchDecision({ ...base, view: "authors", filters: f({ tag: "x" }) })).toBe("skip");
  });

  it("opened on Authors, then moving to All: still the server's page (nothing was consumed)", () => {
    // while on Authors the flag was left alone (decision was "skip"), so All is still hydrated
    expect(feedFetchDecision({ ...base, view: "all", stillHydrated: true })).toBe("hydrated");
  });
});

describe("filedNoticeFor (the 'Added to …' message after sharing)", () => {
  it("says nothing on All — the new link is already in view", () => {
    expect(filedNoticeFor("podcast", "all")).toBeNull();
    expect(filedNoticeFor("article", "all")).toBeNull();
  });

  it("says nothing when it landed in the section you're looking at", () => {
    expect(filedNoticeFor("podcast", "podcasts")).toBeNull();
    expect(filedNoticeFor("article", "articles")).toBeNull();
  });

  it("names the other section when it landed elsewhere", () => {
    expect(filedNoticeFor("podcast", "articles")).toBe("podcasts");
    expect(filedNoticeFor("article", "podcasts")).toBe("articles");
  });

  it("says nothing when the server didn't report a kind (before sections.sql is run)", () => {
    expect(filedNoticeFor(undefined, "articles")).toBeNull();
    expect(filedNoticeFor(null, "podcasts")).toBeNull();
    expect(filedNoticeFor("", "podcasts")).toBeNull();
  });
});
