import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, addUser, asUser, errorOf, sqlFile, type Db } from "./helpers/pg";
import { DUPLICATE_LINK_CONSTRAINT, isDuplicateLinkError } from "@/lib/duplicate-link";

// supabase/duplicate-links.sql against real Postgres: the canonical form, the
// trigger that fills it, the unique rule, the lookup used for the friendly
// message, and — the part that can hurt — running the migration on a database
// that ALREADY contains duplicates.

const BASE = [
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
const MIGRATION = "duplicate-links.sql";

// db.exec returns one result per statement; the file ends with the status SELECT
async function runMigration(db: Db): Promise<string> {
  const results = await db.exec(sqlFile(MIGRATION));
  const last = results[results.length - 1];
  return (last.rows[0] as { status: string }).status;
}

describe("canonicalize_url", () => {
  let db: Db;
  const canon = async (url: string | null) =>
    (await db.query<{ c: string | null }>(`select public.canonicalize_url($1) as c`, [url])).rows[0].c;

  beforeAll(async () => {
    db = await createDb([...BASE, MIGRATION]);
  }, 60_000);
  afterAll(async () => db?.close());

  // [input, canonical]
  it.each([
    // scheme / host
    ["http://example.com/a", "https://example.com/a"],
    ["HTTPS://EXAMPLE.COM/Path", "https://example.com/Path"],
    ["https://www.example.com/a", "https://example.com/a"],
    ["https://example.com:443/a", "https://example.com/a"],
    ["http://example.com:80/a", "https://example.com/a"],
    ["https://user:pw@example.com/a", "https://example.com/a"],
    // path
    ["https://example.com", "https://example.com/"],
    ["https://example.com/", "https://example.com/"],
    ["https://example.com/a/", "https://example.com/a"],
    ["https://example.com/a//", "https://example.com/a"],
    ["https://example.com/a/b/", "https://example.com/a/b"],
    ["https://example.com/Case/Matters", "https://example.com/Case/Matters"],
    ["https://example.com/a%2Fb", "https://example.com/a%2Fb"],
    // fragment
    ["https://example.com/a#comments", "https://example.com/a"],
    ["https://example.com/a?x=1#top", "https://example.com/a?x=1"],
    // query: tracking dropped, real params kept and sorted
    ["https://example.com/a?utm_source=news&utm_medium=email", "https://example.com/a"],
    ["https://example.com/a?id=5&utm_source=x&fbclid=abc", "https://example.com/a?id=5"],
    ["https://example.com/a?UTM_Campaign=x", "https://example.com/a"],
    ["https://example.com/a?gclid=1&msclkid=2&mc_cid=3&igshid=4", "https://example.com/a"],
    ["https://example.com/a?b=2&a=1", "https://example.com/a?a=1&b=2"],
    ["https://example.com/a?v=abc123", "https://example.com/a?v=abc123"],
    ["https://example.com/a?", "https://example.com/a"],
    ["https://example.com/a?&x=1&&", "https://example.com/a?x=1"],
    ["https://example.com/a/?x=1", "https://example.com/a?x=1"],
    ["https://example.com/a?utm_source", "https://example.com/a"], // a bare tracking param
    // whitespace
    ["  https://example.com/a  ", "https://example.com/a"],
  ])("%s → %s", async (input, expected) => {
    expect(await canon(input)).toBe(expected);
  });

  it("returns null for null / blank input", async () => {
    expect(await canon(null)).toBeNull();
    expect(await canon("   ")).toBeNull();
  });

  describe("links that are the SAME article collapse to one form", () => {
    it.each([
      [
        "https://www.theatlantic.com/ideas/archive/2026/07/story/123/",
        "http://theatlantic.com/ideas/archive/2026/07/story/123?utm_source=twitter#comments",
        "https://THEATLANTIC.com/ideas/archive/2026/07/story/123/?fbclid=zzz",
      ],
      ["https://example.com/a?x=1&y=2", "https://example.com/a?y=2&x=1", "https://www.example.com/a/?y=2&x=1&utm_term=t"],
    ])("variants of %s", async (...variants) => {
      const forms = await Promise.all(variants.map((v) => canon(v)));
      expect(new Set(forms).size).toBe(1);
    });
  });

  describe("links that are DIFFERENT articles stay different", () => {
    it.each([
      ["https://example.com/a", "https://example.com/b"],
      ["https://example.com/a", "https://example.com/A"], // paths are case-sensitive
      ["https://example.com/a?id=1", "https://example.com/a?id=2"],
      ["https://example.com/a", "https://example.com/a?id=1"],
      ["https://blog.example.com/a", "https://example.com/a"], // subdomains differ
      ["https://m.example.com/a", "https://example.com/a"],
      ["https://example.com:8080/a", "https://example.com/a"], // a non-default port is a different server
      ["https://example.com/a", "https://example.org/a"],
      ["https://www.youtube.com/watch?v=aaa", "https://www.youtube.com/watch?v=bbb"],
    ])("%s vs %s", async (x, y) => {
      expect(await canon(x)).not.toBe(await canon(y));
    });
  });

  it("is idempotent: canonicalizing a canonical form changes nothing", async () => {
    for (const u of ["https://example.com/a?b=2&a=1&utm_source=x", "http://WWW.Example.com/a/", "https://example.com"]) {
      const once = await canon(u);
      expect(await canon(once)).toBe(once);
    }
  });

  it("is IMMUTABLE (required to be usable in an index) and pins its search_path", async () => {
    const { rows } = await db.query<{ provolatile: string; proconfig: string[] | null }>(
      `select provolatile, proconfig from pg_proc where proname = 'canonicalize_url'`
    );
    expect(rows[0].provolatile).toBe("i");
    expect(rows[0].proconfig).toEqual(expect.arrayContaining([expect.stringMatching(/search_path/)]));
  });
});

describe("the rule, on a fresh install", () => {
  let db: Db;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    db = await createDb([...BASE, MIGRATION]);
    alice = await addUser(db, "alice@example.com");
    bob = await addUser(db, "bob@example.com");
    await db.query(`update public.profiles set display_name = 'Alice' where id = $1`, [alice]);
  }, 60_000);
  afterAll(async () => db?.close());

  const share = (user: string, url: string, extra: Record<string, unknown> = {}) =>
    asUser(db, { sub: user, email: `${user}@example.com` }, () => {
      const cols = ["url", "submitted_by", ...Object.keys(extra)];
      const vals = [url, user, ...Object.values(extra)];
      return db.query<{ id: string; url_canonical: string }>(
        `insert into public.articles (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id, url_canonical`,
        vals
      );
    });

  // the raw error object, to check the SQLSTATE the app keys on
  const failure = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (e) {
      return e as { code?: string; message: string; detail?: string };
    }
  };

  it("fills url_canonical on insert, as the signed-in user (the trigger's function is callable by them)", async () => {
    const r = await share(alice, "https://www.example.com/story/?utm_source=x");
    expect(r.rows[0]).toMatchObject({ url_canonical: "https://example.com/story" });
  });

  it("rejects a second share of the same article — by anyone — as a unique violation on the named index", async () => {
    for (const [user, url] of [
      [alice, "https://example.com/story"], // the same person again
      [bob, "http://EXAMPLE.com/story#top"], // a different person
      [bob, "https://example.com/story/?fbclid=abc&utm_campaign=z"],
    ] as const) {
      const err = await failure(() => share(user, url));
      expect(err?.code).toBe("23505");
      expect(err?.message).toContain(DUPLICATE_LINK_CONSTRAINT);
      // and the app's own detector recognizes exactly this error
      expect(isDuplicateLinkError({ code: err?.code, message: err?.message, details: err?.detail })).toBe(true);
    }
  });

  it("allows genuinely different articles", async () => {
    expect(await errorOf(() => share(bob, "https://example.com/another-story"))).toBeNull();
    expect(await errorOf(() => share(bob, "https://example.com/story?id=2"))).toBeNull();
    expect(await errorOf(() => share(bob, "https://blog.example.com/story"))).toBeNull();
  });

  it("frees the link when the original is removed", async () => {
    const r = await share(alice, "https://example.com/temporary");
    expect(await errorOf(() => share(bob, "https://example.com/temporary/"))).not.toBeNull();
    await asUser(db, { sub: alice }, () => db.query(`delete from public.articles where id = $1`, [r.rows[0].id]));
    expect(await errorOf(() => share(bob, "https://example.com/temporary/"))).toBeNull();
  });

  it("a client can't spoof or sidestep the canonical column: the trigger overwrites whatever it sends", async () => {
    const r = await share(alice, "https://example.com/spoof-attempt", { url_canonical: "https://totally-different.com/x" });
    expect(r.rows[0].url_canonical).toBe("https://example.com/spoof-attempt");
    // so claiming another article's canonical form can't make a duplicate "look" unique
    const err = await failure(() => share(bob, "https://example.com/spoof-attempt", { url_canonical: "https://unrelated.com/" }));
    expect(err?.code).toBe("23505");
  });

  it("recomputes when the url changes", async () => {
    // there is no UPDATE policy for clients, so use the owner role (like the SQL editor)
    const { rows } = await db.query<{ id: string }>(
      `insert into public.articles (url, submitted_by) values ('https://example.com/before', $1) returning id`,
      [alice]
    );
    await db.query(`update public.articles set url = 'http://www.example.com/after/' where id = $1`, [rows[0].id]);
    const after = await db.query<{ url_canonical: string }>(`select url_canonical from public.articles where id = $1`, [rows[0].id]);
    expect(after.rows[0].url_canonical).toBe("https://example.com/after");
  });

  describe("find_shared_article (powers the 'Alice already shared this' message)", () => {
    const find = (user: string | null, url: string, role: "authenticated" | "anon" = "authenticated") =>
      asUser(
        db,
        user ? { sub: user } : null,
        async () => (await db.query(`select * from public.find_shared_article($1)`, [url])).rows as Record<string, unknown>[],
        role
      );

    it("finds the existing share from ANY variant of the link, with who shared it", async () => {
      const rows = await find(bob, "http://www.example.com/story/?utm_source=whatever#x");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ submitted_by: alice, shared_by: "Alice" });
    });

    it("returns nothing for a link nobody has shared", async () => {
      expect(await find(bob, "https://example.com/never-shared")).toEqual([]);
    });

    it("is SECURITY INVOKER, so row-level security applies", async () => {
      const { rows } = await db.query<{ prosecdef: boolean }>(`select prosecdef from pg_proc where proname = 'find_shared_article'`);
      expect(rows[0].prosecdef).toBe(false);
    });

    it("is not callable by anon", async () => {
      expect(await errorOf(() => find(null, "https://example.com/story", "anon"))).toMatch(/permission denied/i);
    });
  });

  it("doesn't disturb the feed: feed_articles() still returns whole rows with the new column present", async () => {
    const rows = await asUser(db, { sub: alice }, async () =>
      (await db.query(`select id, url, url_canonical from public.feed_articles(p_limit => 3)`)).rows as Record<string, unknown>[]
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].url_canonical).toEqual(expect.any(String));
  });
});

describe("running the migration on a database that already has data", () => {
  let db: Db;
  let alice: string;

  beforeAll(async () => {
    db = await createDb(BASE); // note: no migration yet — this is "production today"
    alice = await addUser(db, "alice@example.com");
    const ins = (url: string, title: string) =>
      db.query(`insert into public.articles (url, title, submitted_by) values ($1, $2, $3)`, [url, title, alice]);
    await ins("https://example.com/story", "Story (original)");
    await ins("https://www.example.com/story/?utm_source=twitter", "Story (shared again)");
    await ins("https://example.com/unique", "Only once");
  }, 60_000);
  afterAll(async () => db?.close());

  it("backfills url_canonical for existing rows, but does NOT build the index while duplicates exist", async () => {
    const status = await runMigration(db);
    expect(status).toMatch(/^NOT YET: 1 link\(s\)/);
    expect(status).toMatch(/re-run this file/);

    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.articles where url_canonical is not null`);
    expect(rows[0].n).toBe(3); // every row was backfilled
    const idx = await db.query(`select 1 from pg_indexes where indexname = 'articles_url_canonical_key'`);
    expect(idx.rows).toHaveLength(0);
  });

  it("a failed index build doesn't undo the rest: the trigger and lookup are already in place", async () => {
    const { rows } = await db.query<{ c: string }>(
      `insert into public.articles (url, submitted_by) values ('http://www.example.com/fresh/', $1) returning url_canonical as c`,
      [alice]
    );
    expect(rows[0].c).toBe("https://example.com/fresh");
  });

  it("re-running with the duplicates still there is harmless and reports the same thing", async () => {
    expect(await runMigration(db)).toMatch(/^NOT YET: 1 link\(s\)/);
  });

  it("once the duplicate is resolved, re-running turns protection on", async () => {
    await db.query(`delete from public.articles where title = 'Story (shared again)'`);
    expect(await runMigration(db)).toBe("OK: duplicate-link protection is ON");

    const err = await errorOf(() =>
      db.query(`insert into public.articles (url, submitted_by) values ('https://example.com/story/', $1)`, [alice])
    );
    expect(err).toContain(DUPLICATE_LINK_CONSTRAINT);
  });

  it("is idempotent once on: running it again changes nothing and reports ON", async () => {
    expect(await runMigration(db)).toBe("OK: duplicate-link protection is ON");
    expect(await runMigration(db)).toBe("OK: duplicate-link protection is ON");
  });

  it("the commented-out 'keep the earliest' delete does what it says (checked by running it on a scratch copy)", async () => {
    const scratch = await createDb(BASE);
    const u = await addUser(scratch, "s@example.com");
    for (const [url, t] of [
      ["https://example.com/dup", "first"],
      ["https://www.example.com/dup/", "second"],
      ["http://example.com/dup#x", "third"],
      ["https://example.com/solo", "solo"],
    ]) {
      await scratch.query(`insert into public.articles (url, title, submitted_by) values ($1, $2, $3)`, [url, t, u]);
      await new Promise((r) => setTimeout(r, 5)); // distinct created_at
    }
    await runMigration(scratch); // backfills; index not built (duplicates)
    // the exact statement from the file's comment block
    const sql = sqlFile(MIGRATION);
    const stmt = sql
      .slice(sql.indexOf("--   delete from public.articles a"))
      .split("\n")
      .slice(0, 5)
      .map((l) => l.replace(/^--\s?/, ""))
      .join("\n");
    await scratch.exec(stmt);
    const left = await scratch.query<{ title: string }>(`select title from public.articles order by created_at`);
    expect(left.rows.map((r) => r.title)).toEqual(["first", "solo"]);
    expect(await runMigration(scratch)).toBe("OK: duplicate-link protection is ON");
    await scratch.close();
  });
});
