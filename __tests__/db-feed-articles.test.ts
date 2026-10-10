import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, addUser, asUser, errorOf, type Db } from "./helpers/pg";

// Runs supabase/launch-hardening.sql's feed_articles() against real Postgres.
// The app's mock-based tests can only check that fetchEnrichedArticles passes
// the right arguments; whether those arguments *select the right rows* is a
// property of the SQL, and only a real database can answer it.

const ALL_SCHEMA = [
  "schema.sql",
  "nods-schema.sql",
  "nod-counts-view.sql",
  "article-state-schema.sql",
  "profiles-schema.sql",
  "authors-schema.sql",
  "feedback-schema.sql",
  "content-constraints.sql",
  "launch-hardening.sql",
];

// Fixed UUIDs so the same-timestamp tie-break is deterministic: a5's id sorts
// above a4's, so (created_at desc, id desc) puts a5 first.
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const [a1, a2, a3, a4, a5, a6] = [1, 2, 3, 4, 5, 6].map(id);

let db: Db;
let userA: string;
let userB: string;

type Args = {
  tag?: string | null;
  saved?: boolean;
  read?: boolean;
  dismissed?: boolean;
  beforeCreatedAt?: string | null;
  beforeId?: string | null;
  limit?: number;
};

async function feed(user: string | null, args: Args = {}, role: "authenticated" | "anon" = "authenticated") {
  return asUser(
    db,
    user ? { sub: user, email: "x@example.com" } : null,
    async () => {
      const { rows } = await db.query<{ id: string; created_at: string }>(
        `select id, created_at from public.feed_articles(
           p_tag => $1, p_saved => $2, p_read => $3, p_dismissed => $4,
           p_before_created_at => $5, p_before_id => $6, p_limit => $7)`,
        [
          args.tag ?? null,
          args.saved ?? false,
          args.read ?? false,
          args.dismissed ?? false,
          args.beforeCreatedAt ?? null,
          args.beforeId ?? null,
          args.limit ?? 25,
        ]
      );
      return rows;
    },
    role
  );
}
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

beforeAll(async () => {
  db = await createDb(ALL_SCHEMA);
  userA = await addUser(db, "a@example.com");
  userB = await addUser(db, "b@example.com");

  const insertArticle = (aid: string, createdAt: string, tags: string[]) =>
    db.query(
      `insert into public.articles (id, url, title, tags, submitted_by, created_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [aid, `https://example.com/${aid}`, aid, tags, userA, createdAt]
    );
  await insertArticle(a1, "2026-07-05T12:00:00Z", ["tech"]);
  await insertArticle(a2, "2026-07-04T12:00:00Z", ["tech", "politics"]);
  await insertArticle(a3, "2026-07-03T12:00:00Z", ["politics"]);
  await insertArticle(a4, "2026-07-02T12:00:00Z", []); // same instant as a5
  await insertArticle(a5, "2026-07-02T12:00:00Z", []);
  await insertArticle(a6, "2026-07-01T12:00:00Z", []);

  const state = (user: string, aid: string, saved: boolean, read: boolean, dismissed: boolean) =>
    db.query(
      `insert into public.article_state (article_id, user_id, saved, read, dismissed)
       values ($1, $2, $3, $4, $5)`,
      [aid, user, saved, read, dismissed]
    );
  // A: a1 saved | a2 read | a3 dismissed | a4 saved+read | a5 saved+dismissed | a6 none
  await state(userA, a1, true, false, false);
  await state(userA, a2, false, true, false);
  await state(userA, a3, false, false, true);
  await state(userA, a4, true, true, false);
  await state(userA, a5, true, false, true);
  // B: a1 dismissed | a6 saved — must never show up in A's results, or vice versa
  await state(userB, a1, false, false, true);
  await state(userB, a6, true, false, false);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("feed_articles — which rows come back", () => {
  it("default view hides what the caller dismissed, newest first", async () => {
    expect(ids(await feed(userA))).toEqual([a1, a2, a4, a6]);
  });

  it("dismissed view shows only what the caller dismissed", async () => {
    expect(ids(await feed(userA, { dismissed: true }))).toEqual([a3, a5]);
  });

  it("saved view", async () => {
    // a5 is saved but dismissed: the default view excludes it, and saved
    // doesn't override that — "saved" narrows the default view.
    expect(ids(await feed(userA, { saved: true }))).toEqual([a1, a4]);
  });

  it("read view", async () => {
    expect(ids(await feed(userA, { read: true }))).toEqual([a2, a4]);
  });

  it("saved + read is an intersection, not a union", async () => {
    expect(ids(await feed(userA, { saved: true, read: true }))).toEqual([a4]);
  });

  it("dismissed + saved is the dismissed articles that are also saved", async () => {
    expect(ids(await feed(userA, { dismissed: true, saved: true }))).toEqual([a5]);
  });

  it("dismissed + read is empty when nothing is both", async () => {
    expect(ids(await feed(userA, { dismissed: true, read: true }))).toEqual([]);
  });

  it("tag filter, alone and combined with state filters", async () => {
    expect(ids(await feed(userA, { tag: "tech" }))).toEqual([a1, a2]);
    // a3 is politics but dismissed → hidden by default, shown under dismissed
    expect(ids(await feed(userA, { tag: "politics" }))).toEqual([a2]);
    expect(ids(await feed(userA, { tag: "politics", dismissed: true }))).toEqual([a3]);
    expect(ids(await feed(userA, { tag: "tech", saved: true }))).toEqual([a1]);
  });

  it("an unknown tag matches nothing", async () => {
    expect(ids(await feed(userA, { tag: "nope" }))).toEqual([]);
  });

  it("another user's state is invisible: each caller sees only their own", async () => {
    // B dismissed a1 and saved a6; A's flags don't apply to B at all
    expect(ids(await feed(userB))).toEqual([a2, a3, a5, a4, a6]);
    expect(ids(await feed(userB, { saved: true }))).toEqual([a6]);
    expect(ids(await feed(userB, { dismissed: true }))).toEqual([a1]);
  });

  it("returns whole article rows (all columns the app enriches from)", async () => {
    const rows = await asUser(db, { sub: userA }, async () => {
      const { rows } = await db.query(
        `select * from public.feed_articles(p_limit => 1)`
      );
      return rows as Record<string, unknown>[];
    });
    expect(Object.keys(rows[0])).toEqual(
      expect.arrayContaining(["id", "url", "title", "tags", "submitted_by", "created_at", "archive_url"])
    );
  });
});

describe("feed_articles — keyset pagination", () => {
  // Walk the whole default feed for B (5 rows, including the a5/a4 same-instant
  // pair) with a given page size, the way the app does: ask for size+1, keep
  // `size`, and use the last kept row as the next cursor.
  async function walk(user: string, size: number) {
    const seen: string[] = [];
    let cursor: { created_at: string; id: string } | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const rows = await feed(user, {
        limit: size + 1,
        beforeCreatedAt: cursor?.created_at ?? null,
        beforeId: cursor?.id ?? null,
      });
      const page = rows.slice(0, size);
      seen.push(...ids(page));
      if (rows.length <= size) break;
      const last = page[page.length - 1];
      cursor = { created_at: new Date(last.created_at).toISOString(), id: last.id };
    }
    return seen;
  }

  it.each([1, 2, 3, 4])(
    "page size %i visits every article exactly once, in order, across the same-timestamp pair",
    async (size) => {
      expect(await walk(userB, size)).toEqual([a2, a3, a5, a4, a6]);
    }
  );

  it("a cursor on the first of two same-instant rows returns the second, not a skip", async () => {
    // a5 and a4 share created_at; the cursor is (that instant, a5)
    const rows = await feed(userB, { beforeCreatedAt: "2026-07-02T12:00:00Z", beforeId: a5 });
    expect(ids(rows)).toEqual([a4, a6]);
  });
});

describe("feed_articles — access and limits", () => {
  it("is SECURITY INVOKER with a pinned search_path (so RLS applies and name resolution is safe)", async () => {
    const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
      `select prosecdef, proconfig from pg_proc where proname = 'feed_articles'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].prosecdef).toBe(false);
    expect(rows[0].proconfig).toEqual(expect.arrayContaining([expect.stringMatching(/search_path/)]));
  });

  it("is not executable by anon", async () => {
    const err = await errorOf(() => feed(null, {}, "anon"));
    expect(err).toMatch(/permission denied/i);
  });

  it("a caller with no identity sees no per-user state (and so hides nothing)", async () => {
    // authenticated role but empty claims: auth.uid() is null, the join finds
    // no state rows → everything is "not dismissed". It must not error, and it
    // must not accidentally match some real user's rows.
    // Newest first; a5 precedes a4 because they share an instant and a5's id is larger.
    expect(ids(await feed(null))).toEqual([a1, a2, a3, a5, a4, a6]);
  });
});

// Kept last on purpose: it adds 60 articles, which would change the expected
// lists above if it ran earlier. The tag keeps it self-contained regardless.
describe("feed_articles — page-size clamp", () => {
  beforeAll(async () => {
    await db.query(
      `insert into public.articles (url, title, tags, submitted_by, created_at)
       select 'https://example.com/bulk/' || g, 'bulk ' || g, array['bulk'], $1,
              '2026-06-01T00:00:00Z'::timestamptz + (g || ' minutes')::interval
       from generate_series(1, 60) g`,
      [userA]
    );
  });

  it("caps an oversized request at 51 rows (page size 50 + the lookahead row)", async () => {
    expect(await feed(userA, { tag: "bulk", limit: 1000 })).toHaveLength(51);
  });

  it("raises a zero/negative request to 1", async () => {
    expect(await feed(userA, { tag: "bulk", limit: 0 })).toHaveLength(1);
    expect(await feed(userA, { tag: "bulk", limit: -5 })).toHaveLength(1);
  });
});
