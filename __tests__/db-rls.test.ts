import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, addUser, asUser, errorOf, type Db } from "./helpers/pg";

// Row-level security, exercised for real. Until now only the feedback table's
// policy and the feed function were tested against Postgres; everything else was
// trusted to match the SQL files. RLS is THE wall between users (the anon key is
// public and PostgREST is reachable directly), so each table's policies get
// positive AND negative cases here, run as `authenticated` / `anon` with real
// JWT claims — exactly how PostgREST would run them.
//
// Reading the results: a policy violation on INSERT is an *error*; on UPDATE or
// DELETE the row is simply invisible, so it's "0 rows affected", not an error.

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
  "duplicate-links.sql",
];

let db: Db;
let alice: string;
let bob: string;
let aliceArticle: string;
let bobArticle: string;

const as = <T>(user: string, fn: () => Promise<T>) => asUser(db, { sub: user, email: `${user}@example.com` }, fn);
const asAnon = <T>(fn: () => Promise<T>) => asUser(db, null, fn, "anon");

// SELECT count(*) as the given caller
const count = (user: string | null, table: string, where = "", params: unknown[] = []) => {
  const q = async () =>
    (await db.query<{ n: number }>(`select count(*)::int as n from public.${table} ${where}`, params)).rows[0].n;
  return user ? as(user, q) : asAnon(q);
};
// How many rows a write touched (0 = blocked by RLS, not an error)
const affected = async (user: string | null, sql: string, params: unknown[] = []) => {
  const run = async () => (await db.query(sql, params)).affectedRows ?? 0;
  return user ? as(user, run) : asAnon(run);
};
const rlsError = (e: string | null) => expect(e).toMatch(/row-level security|permission denied/i);

beforeAll(async () => {
  db = await createDb(ALL_SCHEMA);
  alice = await addUser(db, "alice@example.com");
  bob = await addUser(db, "bob@example.com");

  const ins = async (owner: string, url: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.articles (url, title, submitted_by) values ($1, $1, $2) returning id`,
        [url, owner]
      )
    ).rows[0].id;
  aliceArticle = await ins(alice, "https://example.com/alice");
  bobArticle = await ins(bob, "https://example.com/bob");

  await db.query(`insert into public.nods (article_id, user_id) values ($1, $2)`, [bobArticle, alice]); // alice nodded bob's
  await db.query(`insert into public.nods (article_id, user_id) values ($1, $2)`, [aliceArticle, bob]); // bob nodded alice's
  await db.query(`insert into public.article_state (article_id, user_id, saved) values ($1, $2, true)`, [bobArticle, alice]);
  await db.query(`insert into public.article_state (article_id, user_id, read) values ($1, $2, true)`, [aliceArticle, bob]);
}, 60_000);

afterAll(async () => db?.close());

describe("articles", () => {
  it("every signed-in user can read every article", async () => {
    expect(await count(alice, "articles")).toBe(2);
    expect(await count(bob, "articles")).toBe(2);
  });

  it("anon can read none", async () => {
    expect(await count(null, "articles")).toBe(0);
  });

  it("you can share as yourself", async () => {
    const r = await as(alice, () =>
      db.query(`insert into public.articles (url, submitted_by) values ('https://example.com/new', $1)`, [alice])
    );
    expect(r.affectedRows).toBe(1);
    await db.query(`delete from public.articles where url = 'https://example.com/new'`);
  });

  it("you can NOT share as someone else", async () => {
    rlsError(
      await errorOf(() =>
        as(alice, () => db.query(`insert into public.articles (url, submitted_by) values ('https://example.com/x', $1)`, [bob]))
      )
    );
  });

  it("anon can NOT share", async () => {
    rlsError(
      await errorOf(() => asAnon(() => db.query(`insert into public.articles (url, submitted_by) values ('https://example.com/x', $1)`, [alice])))
    );
  });

  it("nobody can edit an article — there is no UPDATE policy (not even your own)", async () => {
    expect(await affected(alice, `update public.articles set title = 'hacked' where id = $1`, [bobArticle])).toBe(0);
    expect(await affected(alice, `update public.articles set title = 'edited' where id = $1`, [aliceArticle])).toBe(0);
  });

  it("you can delete only your own", async () => {
    expect(await affected(alice, `delete from public.articles where id = $1`, [bobArticle])).toBe(0);
    expect(await count(bob, "articles", "where id = $1", [bobArticle])).toBe(1); // still there
  });
});

describe("the cascade behind the 'Remove' confirmation", () => {
  // The confirm dialog says "Its Nods and anyone's Saved/Read marks go with it".
  // This is the test that makes that sentence true.
  it("deleting your article removes everyone's Nods and Saved/Read marks for it", async () => {
    const id = (
      await db.query<{ id: string }>(
        `insert into public.articles (url, submitted_by) values ('https://example.com/cascade', $1) returning id`,
        [alice]
      )
    ).rows[0].id;
    await db.query(`insert into public.nods (article_id, user_id) values ($1, $2)`, [id, bob]);
    await db.query(`insert into public.article_state (article_id, user_id, saved) values ($1, $2, true)`, [id, bob]);

    expect(await affected(alice, `delete from public.articles where id = $1`, [id])).toBe(1);

    const nods = await db.query(`select 1 from public.nods where article_id = $1`, [id]);
    const state = await db.query(`select 1 from public.article_state where article_id = $1`, [id]);
    expect(nods.rows).toHaveLength(0);
    expect(state.rows).toHaveLength(0);
  });
});

describe("nods", () => {
  it("nod counts are public among signed-in users: everyone sees every nod", async () => {
    expect(await count(alice, "nods")).toBe(2);
    expect(await count(bob, "nods")).toBe(2);
  });

  it("anon sees none", async () => {
    expect(await count(null, "nods")).toBe(0);
  });

  it("you can nod as yourself, but not as someone else", async () => {
    const mine = await as(alice, () => db.query(`insert into public.nods (article_id, user_id) values ($1, $2)`, [aliceArticle, alice]));
    expect(mine.affectedRows).toBe(1);
    rlsError(await errorOf(() => as(alice, () => db.query(`insert into public.nods (article_id, user_id) values ($1, $2)`, [aliceArticle, bob]))));
    await db.query(`delete from public.nods where article_id = $1 and user_id = $2`, [aliceArticle, alice]);
  });

  it("you can only un-nod your own", async () => {
    expect(await affected(alice, `delete from public.nods where user_id = $1`, [bob])).toBe(0);
    expect(await count(bob, "nods", "where user_id = $1", [bob])).toBe(1);
  });

  it("nods can't be edited (no UPDATE policy)", async () => {
    expect(await affected(alice, `update public.nods set created_at = now() where user_id = $1`, [alice])).toBe(0);
  });
});

describe("profiles", () => {
  it("everyone signed in can read every profile (it's how names appear on articles)", async () => {
    expect(await count(alice, "profiles")).toBe(2);
  });

  it("anon can read none", async () => {
    expect(await count(null, "profiles")).toBe(0);
  });

  it("you can rename yourself, but not anyone else", async () => {
    expect(await affected(alice, `update public.profiles set display_name = 'Alice A.' where id = $1`, [alice])).toBe(1);
    expect(await affected(alice, `update public.profiles set display_name = 'pwned' where id = $1`, [bob])).toBe(0);
    const bobName = await as(bob, async () => (await db.query<{ display_name: string }>(`select display_name from public.profiles where id = $1`, [bob])).rows[0].display_name);
    expect(bobName).toBe("bob");
  });

  it("you can't hand your profile row to another account", async () => {
    // WITH CHECK (auth.uid() = id): the updated row must still be yours
    rlsError(await errorOf(() => as(alice, () => db.query(`update public.profiles set id = $1 where id = $2`, [bob, alice]))));
  });

  it("clients can't create or delete profiles — the signup trigger owns that", async () => {
    const stranger = "99999999-9999-4999-8999-999999999999";
    rlsError(await errorOf(() => as(alice, () => db.query(`insert into public.profiles (id, display_name) values ($1, 'x')`, [stranger]))));
    expect(await affected(alice, `delete from public.profiles where id = $1`, [alice])).toBe(0);
  });
});

describe("article_state (private per-user flags)", () => {
  it("you see only your own rows — never another user's saved/read/dismissed", async () => {
    expect(await count(alice, "article_state")).toBe(1);
    expect(await count(bob, "article_state")).toBe(1);
    expect(await count(alice, "article_state", "where user_id = $1", [bob])).toBe(0);
  });

  it("anon sees none", async () => {
    expect(await count(null, "article_state")).toBe(0);
  });

  it("you can write your own state, but not on behalf of someone else", async () => {
    const mine = await as(alice, () =>
      db.query(`insert into public.article_state (article_id, user_id, dismissed) values ($1, $2, true)`, [aliceArticle, alice])
    );
    expect(mine.affectedRows).toBe(1);
    rlsError(
      await errorOf(() =>
        as(alice, () => db.query(`insert into public.article_state (article_id, user_id, saved) values ($1, $2, true)`, [aliceArticle, bob]))
      )
    );
    await db.query(`delete from public.article_state where article_id = $1 and user_id = $2`, [aliceArticle, alice]);
  });

  it("you can update only your own row, and can't reassign it to someone else", async () => {
    expect(await affected(alice, `update public.article_state set saved = false where user_id = $1`, [alice])).toBe(1);
    expect(await affected(alice, `update public.article_state set saved = true where user_id = $1`, [bob])).toBe(0);
    // Moving your row onto another account's id would plant data in their private
    // state. Blocked twice: by this policy's WITH CHECK, and independently by the
    // SELECT policy (the new row must be readable by you) — so loosening ONE of
    // them alone doesn't open it; the test still catches loosening both.
    rlsError(await errorOf(() => as(alice, () => db.query(`update public.article_state set user_id = $1 where user_id = $2`, [bob, alice]))));
    await db.query(`update public.article_state set saved = true where user_id = $1`, [alice]);
  });

  it("you can delete only your own", async () => {
    expect(await affected(alice, `delete from public.article_state where user_id = $1`, [bob])).toBe(0);
    expect(await count(bob, "article_state")).toBe(1);
  });
});

describe("authors (curated feeds)", () => {
  it("signed-in users can read them; anon can't", async () => {
    expect(await count(alice, "authors")).toBeGreaterThan(0);
    expect(await count(null, "authors")).toBe(0);
  });

  it("no client can add, change, or remove an author — that's a dashboard job", async () => {
    rlsError(await errorOf(() => as(alice, () => db.query(`insert into public.authors (name, rss_url) values ('Mallory', 'https://evil.example/feed')`))));
    expect(await affected(alice, `update public.authors set rss_url = 'https://evil.example/feed'`)).toBe(0);
    expect(await affected(alice, `delete from public.authors`)).toBe(0);
    expect(await count(alice, "authors", "where rss_url like '%evil%'")).toBe(0);
  });
});

describe("article_nod_counts view", () => {
  it("is security_invoker, so it reads nods as the caller", async () => {
    const { rows } = await db.query<{ reloptions: string[] | null }>(
      `select reloptions from pg_class where relname = 'article_nod_counts'`
    );
    expect(rows[0].reloptions).toEqual(expect.arrayContaining(["security_invoker=true"]));
  });

  it("shows signed-in users the counts, and anon nothing (nods RLS applies through it)", async () => {
    const counts = await as(alice, async () => (await db.query<{ article_id: string; nod_count: number }>(`select * from public.article_nod_counts`)).rows);
    expect(counts.map((r) => r.nod_count).sort()).toEqual([1, 1]);
    expect(await count(null, "article_nod_counts")).toBe(0);
  });

  describe("tightening nods' read policy propagates through the view (the BACKLOG 'hide nod counts' option)", () => {
    // Destructive to the policy set, so it gets its own database
    let scratch: Db;
    let scratchUser: string;
    beforeAll(async () => {
      scratch = await createDb(ALL_SCHEMA);
      const a = await addUser(scratch, "a@example.com");
      scratchUser = a;
      const b = await addUser(scratch, "b@example.com");
      const art = (
        await scratch.query<{ id: string }>(`insert into public.articles (url, submitted_by) values ('https://example.com/x', $1) returning id`, [a])
      ).rows[0].id;
      await scratch.query(`insert into public.nods (article_id, user_id) values ($1, $2), ($1, $3)`, [art, a, b]);
    }, 60_000);
    afterAll(async () => scratch?.close());

    it("before: a user sees both nods in the count; after restricting nods to your own: only yours", async () => {
      const countAs = () =>
        asUser(scratch, { sub: scratchUser }, async () => (await scratch.query<{ nod_count: number }>(`select nod_count from public.article_nod_counts`)).rows[0]?.nod_count ?? 0);

      expect(await countAs()).toBe(2);
      await scratch.exec(`
        drop policy "Authenticated users can read nods" on public.nods;
        create policy "Users can read their own nods" on public.nods for select to authenticated using (auth.uid() = user_id);
      `);
      expect(await countAs()).toBe(1); // the view did NOT bypass the tighter policy
    });
  });
});
