import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUser = { id: "user-123", email: "test@example.com" };

// Shared spy: the route builds `new Parser()` at module load, so the mock
// class wires every instance's parseURL to this one fn we control per-test.
// vi.hoisted is required — vi.mock is hoisted above normal declarations, and
// the route module (with its top-level `new Parser()`) loads before this
// file's const initializers would otherwise run.
//
// `captured` records the options the route passes to `new Parser()`. It can't
// be a vi.fn() spy: the constructor runs once at import time, and the
// beforeEach clearAllMocks below would wipe the call before any test reads it.
const { parseURL, captured } = vi.hoisted(() => ({
  parseURL: vi.fn(),
  captured: { options: undefined as { timeout?: number; customFields?: { item?: string[][] } } | undefined },
}));
vi.mock("rss-parser", () => ({
  default: class MockParser {
    parseURL = parseURL;
    constructor(options?: { timeout?: number; customFields?: { item?: string[][] } }) {
      captured.options = options;
    }
  },
}));

function makeSupabaseMock({
  authors = [] as object[],
  authorsError = null as { message: string } | null,
  authed = true,
} = {}) {
  const order = vi.fn().mockResolvedValue({ data: authors, error: authorsError });
  const select = vi.fn(() => ({ order }));
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: authed ? mockUser : null } }),
    },
    from: vi.fn(() => ({ select })),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/author-articles/route";

const FREE_DESC =
  "A long and detailed description of an article that is freely available to anyone who wants it.";

const benAuthor = {
  id: "a1",
  name: "Ben Thompson",
  rss_url: "https://stratechery.com/feed/",
  website_url: "https://stratechery.com",
  site_icon_url: "https://stratechery.com/icon.png",
};
const philAuthor = {
  id: "a2",
  name: "Phil Gaimon",
  rss_url: "https://philgaimon.substack.com/feed",
  website_url: "https://philgaimon.substack.com",
  site_icon_url: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/author-articles", () => {
  it("filters paywalled items and returns at most 3 free articles per author", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authors: [benAuthor] }) as never);
    parseURL.mockResolvedValue({
      items: [
        { title: "Paid daily", link: "https://s.com/1", contentSnippet: FREE_DESC, categories: ["Daily Update"] },
        { title: "Free 1", link: "https://s.com/2", contentSnippet: FREE_DESC, pubDate: "2026-07-01" },
        { title: "Free 2", link: "https://s.com/3", contentSnippet: FREE_DESC, pubDate: "2026-07-02" },
        { title: "Short teaser (paid)", link: "https://s.com/4", contentSnippet: "Tiny." },
        { title: "Free 3", link: "https://s.com/5", contentSnippet: FREE_DESC, pubDate: "2026-07-03" },
        { title: "Free 4 (past the cap)", link: "https://s.com/6", contentSnippet: FREE_DESC },
      ],
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].articles.map((a: { title: string }) => a.title)).toEqual([
      "Free 1",
      "Free 2",
      "Free 3",
    ]);
  });

  it("hides Ghost-style paid posts, whose <content:encoded> arrives empty (Platformer)", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authors: [benAuthor] }) as never);
    parseURL.mockResolvedValue({
      items: [
        // normal-looking teaser, nothing paid in the text: only the empty body gives it away
        { title: "Paid (empty body)", link: "https://s.com/1", contentSnippet: FREE_DESC, contentEncoded: "" },
        { title: "Free (full body)", link: "https://s.com/2", contentSnippet: FREE_DESC, contentEncoded: "<p>The whole post</p>" },
        { title: "No body tag at all", link: "https://s.com/3", contentSnippet: FREE_DESC },
      ],
    });
    const body = await (await GET()).json();
    expect(body[0].articles.map((a: { title: string }) => a.title)).toEqual(["Free (full body)", "No body tag at all"]);
  });

  it("asks the feed parser for <content:encoded> — without it the empty-body check never fires", () => {
    expect(captured.options?.customFields?.item).toContainEqual(["content:encoded", "contentEncoded"]);
  });

  it("constructs the feed parser with a short timeout, so one hung publisher can't stall the card", () => {
    // rss-parser's own default is 60 s; the route must override it
    expect(captured.options?.timeout).toBeGreaterThan(0);
    expect(captured.options?.timeout).toBeLessThanOrEqual(10_000);
  });

  it("only returns http(s) links: drops javascript:, data:, and missing links without using up the cap", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authors: [benAuthor] }) as never);
    parseURL.mockResolvedValue({
      items: [
        { title: "Evil js", link: "javascript:alert(1)", contentSnippet: FREE_DESC },
        { title: "Evil data", link: "data:text/html,<script>1</script>", contentSnippet: FREE_DESC },
        { title: "No link at all", contentSnippet: FREE_DESC },
        { title: "Empty link", link: "", contentSnippet: FREE_DESC },
        { title: "Good 1", link: "https://s.com/1", contentSnippet: FREE_DESC },
        { title: "Good 2", link: "http://s.com/2", contentSnippet: FREE_DESC },
        { title: "Good 3", link: "https://s.com/3", contentSnippet: FREE_DESC },
        { title: "Good 4 (past the cap)", link: "https://s.com/4", contentSnippet: FREE_DESC },
      ],
    });

    const res = await GET();
    const body = await res.json();

    // The four unusable items must not occupy any of the 3 slots
    expect(body[0].articles.map((a: { title: string }) => a.title)).toEqual(["Good 1", "Good 2", "Good 3"]);
    expect(body[0].articles.every((a: { url: string }) => /^https?:\/\//.test(a.url))).toBe(true);
  });

  it("passes through author identity fields including site_icon_url", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ authors: [benAuthor, philAuthor] }) as never
    );
    parseURL.mockResolvedValue({ items: [] });

    const res = await GET();
    const body = await res.json();

    expect(body[0]).toMatchObject({
      id: "a1",
      name: "Ben Thompson",
      website_url: "https://stratechery.com",
      site_icon_url: "https://stratechery.com/icon.png",
    });
    expect(body[1].site_icon_url).toBeNull();
  });

  it("isolates a failing feed: the broken author gets [] and others are unaffected", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ authors: [benAuthor, philAuthor] }) as never
    );
    parseURL.mockImplementation((url: string) => {
      if (url.includes("stratechery")) return Promise.reject(new Error("feed down"));
      return Promise.resolve({
        items: [{ title: "Phil free", link: "https://p.com/1", contentSnippet: FREE_DESC }],
      });
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body[0].name).toBe("Ben Thompson");
    expect(body[0].articles).toEqual([]);
    expect(body[1].articles).toHaveLength(1);
  });

  it("returns a sanitized 500 (not the raw Postgres message) on a DB error", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ authorsError: { message: 'relation "authors" does not exist' } }) as never
    );
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain("relation");
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authed: false }) as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
