import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, addUser, asUser, errorOf, sqlFile, type Db } from "./helpers/pg";

// supabase/launch-hardening.sql, run against real Postgres (see helpers/pg.ts).

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

let db: Db;

beforeAll(async () => {
  db = await createDb(ALL_SCHEMA);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("the patch file itself", () => {
  it("is idempotent: running it again changes nothing and errors on nothing", async () => {
    await expect(db.exec(sqlFile("launch-hardening.sql"))).resolves.not.toThrow();
    await expect(db.exec(sqlFile("launch-hardening.sql"))).resolves.not.toThrow();
  });
});

describe("handle_new_user() is no longer callable by API roles (#1)", () => {
  it("has no EXECUTE grant for PUBLIC, anon, or authenticated", async () => {
    const { rows } = await db.query<{ anon: boolean; authed: boolean; acl: string | null }>(
      `select has_function_privilege('anon', 'public.handle_new_user()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') as authed,
              (select proacl::text from pg_proc where proname = 'handle_new_user') as acl`
    );
    expect(rows[0].anon).toBe(false);
    expect(rows[0].authed).toBe(false);
    // An ACL entry with an empty grantee ("=X/…") is PUBLIC
    expect(rows[0].acl ?? "").not.toMatch(/(^|[{,])=X/);
  });

  it("cannot be invoked directly by an authenticated caller", async () => {
    const err = await errorOf(() =>
      asUser(db, { sub: "00000000-0000-4000-8000-000000000001" }, () =>
        db.query(`select public.handle_new_user()`)
      )
    );
    expect(err).toMatch(/permission denied/i);
  });

  it("STILL runs when a user is created — revoking EXECUTE must not break signup", async () => {
    // Supabase inserts into auth.users as supabase_auth_admin, which holds no
    // EXECUTE on the function. The trigger still has to fire and create the
    // profile; this is the regression that matters most for the revoke.
    await db.exec(`set role supabase_auth_admin`);
    let id: string;
    try {
      const { rows } = await db.query<{ id: string }>(
        `insert into auth.users (email) values ('new.signup@example.com') returning id`
      );
      id = rows[0].id;
    } finally {
      await db.exec(`reset role`);
    }
    const { rows } = await db.query<{ display_name: string }>(
      `select display_name from public.profiles where id = $1`,
      [id]
    );
    expect(rows).toEqual([{ display_name: "new.signup" }]);
  });
});

describe("feedback.email can't be spoofed by a direct insert (#3)", () => {
  let userId: string;
  let otherId: string;
  const email = "reporter@example.com";

  beforeAll(async () => {
    userId = await addUser(db, email);
    otherId = await addUser(db, "someone.else@example.com");
  });

  const insertAs = (claims: { sub: string; email?: string }, row: { user_id: string; email: string | null }) =>
    asUser(db, claims, () =>
      db.query(`insert into public.feedback (user_id, email, message) values ($1, $2, 'hello')`, [
        row.user_id,
        row.email,
      ])
    );

  it("accepts a row whose user_id and email match the caller's JWT (what the API route sends)", async () => {
    expect(await errorOf(() => insertAs({ sub: userId, email }, { user_id: userId, email }))).toBeNull();
  });

  it("rejects the caller's own user_id with a different email", async () => {
    const err = await errorOf(() =>
      insertAs({ sub: userId, email }, { user_id: userId, email: "ceo@bigcorp.com" })
    );
    expect(err).toMatch(/row-level security/i);
  });

  it("rejects a NULL email when the JWT has one (can't dodge attribution by omitting it)", async () => {
    const err = await errorOf(() => insertAs({ sub: userId, email }, { user_id: userId, email: null }));
    expect(err).toMatch(/row-level security/i);
  });

  it("rejects a user_id that isn't the caller's, even with the caller's email", async () => {
    const err = await errorOf(() => insertAs({ sub: userId, email }, { user_id: otherId, email }));
    expect(err).toMatch(/row-level security/i);
  });

  it("still has no select policy: the author can't read feedback back", async () => {
    const count = await asUser(db, { sub: userId, email }, async () => {
      const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.feedback`);
      return rows[0].n;
    });
    expect(count).toBe(0);
    // ...even though a row really is there
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.feedback`);
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe("article_state(user_id) index exists (#4)", () => {
  it("is present and covers user_id", async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'article_state'
          and indexname = 'article_state_user_idx'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/\(user_id\)/);
  });
});
