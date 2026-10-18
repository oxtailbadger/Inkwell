import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, addUser, asUser, errorOf, sqlFile, type Db } from "./helpers/pg";

// supabase/sections.sql against real Postgres: which URLs count as podcasts, the
// trigger that records it, the migration on a database that already has data and
// the OLD feed function, and the feed function's new section parameter.

const BEFORE_SECTIONS = [
  "schema.sql",
  "nods-schema.sql",
  "nod-counts-view.sql",
  "article-state-schema.sql",
  "profiles-schema.sql",
  "authors-schema.sql",
  "feedback-schema.sql",
  "content-constraints.sql",
  "launch-hardening.sql",
  "duplicate-links.sql",
];
const MIGRATION = "sections.sql";

describe("classify_url", () => {
  let db: Db;
  const kind = async (url: string | null) =>
    (await db.query<{ k: string }>(`select public.classify_url($1) as k`, [url])).rows[0].k;

  beforeAll(async () => {
    db = await createDb([...BEFORE_SECTIONS, MIGRATION]);
  }, 60_000);
  afterAll(async () => db?.close());

  describe("podcasts", () => {
    it.each([
      // Apple
      "https://podcasts.apple.com/us/podcast/the-daily/id1200361736",
      "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000650000000",
      "https://itunes.apple.com/us/podcast/the-daily/id1200361736",
      // Spotify: episodes and shows only, in every URL shape
      "https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk",
      "https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=abc123",
      "https://open.spotify.com/show/6z4NLXyHPga1UmSJsPK7G1",
      "https://open.spotify.com/intl-de/episode/4rOoJ6Egrf8K2IrywzwOMk",
      "https://open.spotify.com/intl-pt-br/show/6z4NLXyHPga1UmSJsPK7G1",
      "https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk",
      "https://podcasters.spotify.com/pod/show/some-show",
      // players and directories
      "https://overcast.fm/+AbCdEf",
      "https://pca.st/abc123",
      "https://pocketcasts.com/podcasts/xyz",
      "https://podcasts.google.com/feed/aHR0cHM6Ly9leGFtcGxl",
      "https://castro.fm/episode/abc",
      "https://castbox.fm/episode/id123",
      "https://player.fm/series/some-show",
      "https://podchaser.com/podcasts/some-show-123",
      "https://www.listennotes.com/podcasts/some-show/",
      // hosting platforms (and their per-show subdomains)
      "https://www.buzzsprout.com/123/456-episode",
      "https://myshow.buzzsprout.com/123/456",
      "https://shows.acast.com/some-show/episodes/an-episode",
      "https://play.acast.com/s/some-show",
      "https://anchor.fm/some-show/episodes/x",
      "https://myshow.podbean.com/e/an-episode/",
      "https://some-show.libsyn.com/an-episode",
      "https://some-show.simplecast.com/episodes/abc",
      "https://some-show.transistor.fm/episodes/abc",
      "https://traffic.megaphone.fm/ABC123.mp3",
      "https://omny.fm/shows/some-show",
      "https://audioboom.com/posts/123",
      "https://some-show.fireside.fm/1",
      "https://some-show.captivate.fm/episode/abc",
      "https://radiopublic.com/some-show-abc",
      // broadcasters, matched by path
      "https://www.iheart.com/podcast/105-some-show-123/",
      "https://www.npr.org/podcasts/510318/up-first",
      "https://tunein.com/podcasts/News--Politics-Podcasts/Some-Show-p123/",
      "https://www.pandora.com/podcast/some-show/PC:1234",
      "https://music.amazon.com/podcasts/abc-123/some-show",
      "https://music.amazon.co.uk/podcasts/abc-123/some-show",
    ])("%s", async (url) => {
      expect(await kind(url)).toBe("podcast");
    });

    it("regardless of how the link is written (case, www., http, trailing slash, tracking params, fragment)", async () => {
      for (const url of [
        "HTTPS://PODCASTS.APPLE.COM/us/podcast/x/id1",
        "http://www.overcast.fm/+AbCdEf/",
        "https://open.spotify.com/episode/abc/?si=tracker&utm_source=copy-link#t=30",
        "  https://pca.st/abc123  ",
      ]) {
        expect(await kind(url)).toBe("podcast");
      }
    });
  });

  describe("everything else stays an article", () => {
    it.each([
      // Spotify's music side
      "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      "https://open.spotify.com/album/1A2GTWGtFfWp7KSQTwWOyo",
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      "https://open.spotify.com/artist/0TnOYISbd1XYRBk9myaseg",
      "https://open.spotify.com/user/someone",
      "https://open.spotify.com/",
      "https://www.spotify.com/us/premium/",
      // paths that merely START like a podcast path
      "https://open.spotify.com/episodes-are-great",
      "https://open.spotify.com/showcase/x",
      // the same broadcasters, but not their podcast pages
      "https://www.npr.org/2026/07/01/1234567/a-news-story",
      "https://www.npr.org/sections/politics/",
      "https://www.iheart.com/artist/some-artist-123/",
      "https://tunein.com/radio/Some-Station-s123/",
      "https://music.amazon.com/albums/B000",
      "https://itunes.apple.com/us/album/some-album/id1",
      "https://music.apple.com/us/album/x/1",
      // ordinary articles, including ones ABOUT podcasts
      "https://www.theatlantic.com/ideas/archive/2026/07/story/123/",
      "https://example.com/my-podcast-notes",
      "https://www.theatlantic.com/podcasts/",
      "https://example.com/episode/123",
      // shorteners can't be resolved by a database function
      "https://spotify.link/abc123",
      "https://spoti.fi/abc123",
      "https://bit.ly/abc",
    ])("%s", async (url) => {
      expect(await kind(url)).toBe("article");
    });

    // The point of anchoring on whole labels: a look-alike must not be a podcast
    it.each([
      "https://podcasts.apple.com.evil.com/us/podcast/x",
      "https://evilpodcasts.apple.com/x",
      "https://overcast.fm.evil.com/+x",
      "https://notovercast.fm/x",
      "https://pca.st.example.com/x",
      "https://open.spotify.com.evil.com/episode/abc",
      "https://example.com/open.spotify.com/episode/abc",
      "https://example.com/?u=https://podcasts.apple.com/x",
    ])("look-alike: %s", async (url) => {
      expect(await kind(url)).toBe("article");
    });

    it("blank and missing input is an article, never an error", async () => {
      expect(await kind(null)).toBe("article");
      expect(await kind("")).toBe("article");
      expect(await kind("   ")).toBe("article");
      expect(await kind("not a url")).toBe("article");
    });
  });

  it("is IMMUTABLE and pins its search_path", async () => {
    const { rows } = await db.query<{ provolatile: string; proconfig: string[] | null }>(
      `select provolatile, proconfig from pg_proc where proname = 'classify_url'`
    );
    expect(rows[0].provolatile).toBe("i");
    expect(rows[0].proconfig).toEqual(expect.arrayContaining([expect.stringMatching(/search_path/)]));
  });
});

describe("the trigger and the column", () => {
  let db: Db;
  let alice: string;

  beforeAll(async () => {
    db = await createDb([...BEFORE_SECTIONS, MIGRATION]);
    alice = await addUser(db, "alice@example.com");
  }, 60_000);
  afterAll(async () => db?.close());

  const share = (url: string, extra = "") =>
    asUser(db, { sub: alice }, async () =>
      (await db.query<{ kind: string }>(`insert into public.articles (url, submitted_by${extra ? ", kind" : ""}) values ($1, $2${extra ? ", $3" : ""}) returning kind`, extra ? [url, alice, extra] : [url, alice])).rows[0].kind
    );

  it("a podcast link is filed as a podcast and an article link as an article, as a signed-in user", async () => {
    expect(await share("https://open.spotify.com/episode/aaa")).toBe("podcast");
    expect(await share("https://example.com/an-article")).toBe("article");
  });

  it("a client can't choose the kind: whatever it sends is overwritten", async () => {
    expect(await share("https://example.com/not-a-podcast", "podcast")).toBe("article");
    expect(await share("https://podcasts.apple.com/us/podcast/x/id9", "article")).toBe("podcast");
  });

  it("changing a URL re-files it", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.articles (url, submitted_by) values ('https://example.com/will-change', $1) returning id`,
      [alice]
    );
    await db.query(`update public.articles set url = 'https://overcast.fm/+changed' where id = $1`, [rows[0].id]);
    const after = await db.query<{ kind: string }>(`select kind from public.articles where id = $1`, [rows[0].id]);
    expect(after.rows[0].kind).toBe("podcast");
  });

  it("the column only ever holds a valid kind (the constraint backs the trigger up)", async () => {
    // an update that doesn't touch url doesn't fire the trigger, so the CHECK is what stops this
    const { rows } = await db.query<{ id: string }>(`select id from public.articles limit 1`);
    expect(
      await errorOf(() => db.query(`update public.articles set kind = 'video' where id = $1`, [rows[0].id]))
    ).toMatch(/articles_kind_valid/);
  });

  it("kind can't be NULL", async () => {
    const { rows } = await db.query<{ id: string }>(`select id from public.articles limit 1`);
    expect(await errorOf(() => db.query(`update public.articles set kind = null where id = $1`, [rows[0].id]))).toMatch(/null value|not-null/i);
  });
});

describe("running the migration on a database that already has data and the OLD feed function", () => {
  let db: Db;
  let alice: string;

  // the 7-argument function exactly as launch-hardening.sql used to define it
  // (body trimmed to its signature — only the signature matters for this test)
  const OLD_FEED_FUNCTION = `
    create function public.feed_articles(
      p_tag text default null, p_saved boolean default false, p_read boolean default false,
      p_dismissed boolean default false, p_before_created_at timestamptz default null,
      p_before_id uuid default null, p_limit integer default 25
    ) returns setof public.articles language sql stable security invoker set search_path = ''
    as $$ select a.* from public.articles a order by a.created_at desc limit 51 $$;
    grant execute on function public.feed_articles(text, boolean, boolean, boolean, timestamptz, uuid, integer) to authenticated;
  `;

  beforeAll(async () => {
    db = await createDb(BEFORE_SECTIONS);
    await db.exec(OLD_FEED_FUNCTION);
    alice = await addUser(db, "alice@example.com");
    const ins = (url: string, title: string) =>
      db.query(`insert into public.articles (url, title, submitted_by) values ($1, $2, $3)`, [url, title, alice]);
    // shared before sections existed: all of them are just "articles" today
    await ins("https://example.com/story", "An article");
    await ins("https://open.spotify.com/episode/abc", "A Spotify episode");
    await ins("https://podcasts.apple.com/us/podcast/x/id1", "An Apple show");
    await ins("https://open.spotify.com/track/xyz", "A Spotify TRACK");
  }, 60_000);
  afterAll(async () => db?.close());

  const status = async () => {
    const results = await db.exec(sqlFile(MIGRATION));
    return (results[results.length - 1].rows[0] as { status: string; podcasts: number; articles: number });
  };

  it("before it runs, every existing row is an 'article' (the column didn't exist)", async () => {
    const r = await db.query(`select 1 from information_schema.columns where table_name = 'articles' and column_name = 'kind'`);
    expect(r.rows).toHaveLength(0);
  });

  it("moves the existing podcast links to Podcasts and reports how many", async () => {
    const s = await status();
    expect(s.status).toBe("OK: sections are set up. 2 existing link(s) moved to Podcasts.");
    expect(s.podcasts).toBe(2);
    expect(s.articles).toBe(2);
    const byTitle = await db.query<{ title: string; kind: string }>(`select title, kind from public.articles order by title`);
    expect(Object.fromEntries(byTitle.rows.map((r) => [r.title, r.kind]))).toEqual({
      "An article": "article",
      "A Spotify episode": "podcast",
      "An Apple show": "podcast",
      "A Spotify TRACK": "article", // music stays music
    });
  });

  it("REPLACES the old feed function rather than adding an overload (only one feed_articles remains, with the section parameter)", async () => {
    const { rows } = await db.query<{ args: string }>(
      `select pg_get_function_arguments(p.oid) as args from pg_proc p where p.proname = 'feed_articles'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].args).toMatch(/p_section text DEFAULT 'articles'/);
  });

  it("an OLDER app that still calls with the 7 original arguments keeps working — and no longer sees podcasts", async () => {
    const titles = await asUser(db, { sub: alice }, async () =>
      (
        await db.query<{ title: string }>(
          `select title from public.feed_articles(
             p_tag => null, p_saved => false, p_read => false, p_dismissed => false,
             p_before_created_at => null, p_before_id => null, p_limit => 25)`
        )
      ).rows.map((r) => r.title).sort()
    );
    expect(titles).toEqual(["A Spotify TRACK", "An article"]);
  });

  it("is idempotent: running it again changes nothing, and re-running launch-hardening.sql does NOT bring the old overload back", async () => {
    await status();
    await db.exec(sqlFile("launch-hardening.sql")); // the documented "safe to re-run" file
    await status();
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from pg_proc where proname = 'feed_articles'`);
    expect(rows[0].n).toBe(1);
  });
});

describe("feed_articles — sections", () => {
  let db: Db;
  let alice: string;
  let bob: string;
  const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const [art1, art2, pod1, pod2, pod3] = [1, 2, 3, 4, 5].map(id);

  type Args = { section?: string | null; tag?: string; saved?: boolean; read?: boolean; dismissed?: boolean; limit?: number; beforeCreatedAt?: string; beforeId?: string };
  const feed = (user: string | null, a: Args = {}, role: "authenticated" | "anon" = "authenticated") =>
    asUser(
      db,
      user ? { sub: user } : null,
      async () => {
        // p_section is only sent when the test sets one, so the default is exercised too
        const named = [
          a.tag !== undefined ? `p_tag => '${a.tag}'` : null,
          a.saved ? "p_saved => true" : null,
          a.read ? "p_read => true" : null,
          a.dismissed ? "p_dismissed => true" : null,
          a.limit !== undefined ? `p_limit => ${a.limit}` : null,
          a.beforeCreatedAt ? `p_before_created_at => '${a.beforeCreatedAt}'` : null,
          a.beforeId ? `p_before_id => '${a.beforeId}'` : null,
          a.section !== undefined ? (a.section === null ? "p_section => null" : `p_section => '${a.section}'`) : null,
        ].filter(Boolean);
        const { rows } = await db.query<{ id: string; kind: string }>(`select id, kind from public.feed_articles(${named.join(", ")})`);
        return rows;
      },
      role
    );
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  beforeAll(async () => {
    db = await createDb([...BEFORE_SECTIONS, MIGRATION]);
    alice = await addUser(db, "alice@example.com");
    bob = await addUser(db, "bob@example.com");
    const ins = (aid: string, url: string, tags: string[], at: string) =>
      db.query(`insert into public.articles (id, url, title, tags, submitted_by, created_at) values ($1, $2, $2, $3, $4, $5)`, [aid, url, tags, alice, at]);
    await ins(art1, "https://example.com/one", ["tech"], "2026-07-05T00:00:00Z");
    await ins(pod1, "https://open.spotify.com/episode/p1", ["tech"], "2026-07-04T00:00:00Z");
    await ins(art2, "https://example.com/two", ["politics"], "2026-07-03T00:00:00Z");
    await ins(pod2, "https://podcasts.apple.com/us/podcast/x/id2", ["politics"], "2026-07-02T00:00:00Z");
    await ins(pod3, "https://overcast.fm/+p3", ["tech"], "2026-07-01T00:00:00Z");
    const state = (user: string, aid: string, s: boolean, r: boolean, d: boolean) =>
      db.query(`insert into public.article_state (article_id, user_id, saved, read, dismissed) values ($1, $2, $3, $4, $5)`, [aid, user, s, r, d]);
    await state(alice, pod1, true, false, false); // alice saved a podcast
    await state(alice, pod2, false, false, true); // alice dismissed a podcast
    await state(alice, art2, false, true, false); // alice read an article
    await state(bob, pod3, true, false, false);
  }, 60_000);
  afterAll(async () => db?.close());

  it("the Articles feed (the default) never contains a podcast", async () => {
    expect(ids(await feed(alice))).toEqual([art1, art2]);
    expect(ids(await feed(alice, { section: "articles" }))).toEqual([art1, art2]);
  });

  it("the Podcasts feed contains only podcasts, newest first, hiding what you dismissed", async () => {
    expect(ids(await feed(alice, { section: "podcasts" }))).toEqual([pod1, pod3]);
  });

  it("every row comes back labelled with its kind", async () => {
    const rows = await feed(alice, { section: "podcasts" });
    expect(rows.every((r) => r.kind === "podcast")).toBe(true);
  });

  it("state filters work INSIDE a section — a saved podcast is not a saved article", async () => {
    expect(ids(await feed(alice, { section: "podcasts", saved: true }))).toEqual([pod1]);
    expect(ids(await feed(alice, { section: "articles", saved: true }))).toEqual([]);
    expect(ids(await feed(alice, { section: "podcasts", dismissed: true }))).toEqual([pod2]);
    expect(ids(await feed(alice, { section: "articles", read: true }))).toEqual([art2]);
    expect(ids(await feed(alice, { section: "podcasts", read: true }))).toEqual([]);
  });

  it("tag filters work inside a section", async () => {
    expect(ids(await feed(alice, { section: "podcasts", tag: "tech" }))).toEqual([pod1, pod3]);
    expect(ids(await feed(alice, { section: "podcasts", tag: "politics" }))).toEqual([]); // pod2 is dismissed
    expect(ids(await feed(alice, { section: "articles", tag: "tech" }))).toEqual([art1]);
  });

  it("pagination works inside a section", async () => {
    const first = await feed(alice, { section: "podcasts", limit: 2 });
    expect(ids(first)).toEqual([pod1, pod3]);
    // cursor from the first page's last row (pod1 is the first of two; use it as the boundary)
    const next = await feed(alice, { section: "podcasts", beforeCreatedAt: "2026-07-04T00:00:00Z", beforeId: pod1 });
    expect(ids(next)).toEqual([pod3]);
  });

  it("each user sees their own state in the Podcasts feed", async () => {
    expect(ids(await feed(bob, { section: "podcasts", saved: true }))).toEqual([pod3]);
    // alice's dismissed pod2 is visible to bob, who never dismissed it
    expect(ids(await feed(bob, { section: "podcasts" }))).toEqual([pod1, pod2, pod3]);
  });

  it("an explicit null means the default (articles); an unknown section matches nothing rather than meaning 'articles'", async () => {
    expect(ids(await feed(alice, { section: null }))).toEqual([art1, art2]);
    expect(await feed(alice, { section: "videos" })).toEqual([]);
    expect(await feed(alice, { section: "" })).toEqual([]);
  });

  it("is SECURITY INVOKER with a pinned search_path, and the one-and-only overload", async () => {
    const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
      `select prosecdef, proconfig from pg_proc where proname = 'feed_articles'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].prosecdef).toBe(false);
    expect(rows[0].proconfig).toEqual(expect.arrayContaining([expect.stringMatching(/search_path/)]));
  });

  it("is not executable by anon", async () => {
    expect(await errorOf(() => feed(null, { section: "podcasts" }, "anon"))).toMatch(/permission denied/i);
  });

  it("returns whole rows including the columns added by the other migrations", async () => {
    const rows = await asUser(db, { sub: alice }, async () =>
      (await db.query<Record<string, unknown>>(`select * from public.feed_articles(p_section => 'podcasts', p_limit => 1)`)).rows
    );
    expect(Object.keys(rows[0])).toEqual(expect.arrayContaining(["id", "url", "kind", "url_canonical", "tags", "created_at"]));
  });
});
