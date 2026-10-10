import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Real-Postgres test harness. Everything else in __tests__/ mocks Supabase, so
// it can't see SQL: RLS policies, CHECK constraints, and the feed_articles()
// function are invisible to it. This runs the project's actual supabase/*.sql
// files against an in-process Postgres (PGlite) with only the Supabase-provided
// pieces stubbed: the auth schema, auth.uid()/auth.jwt() driven by the same
// `request.jwt.claims` setting PostgREST uses, and the API roles.
//
// What it is NOT: PostgREST. Query-string semantics, the REST layer, and
// Supabase's own role grants are not exercised — only SQL behaviour is.

const SUPABASE_DIR = join(process.cwd(), "supabase");

export const sqlFile = (name: string) => readFileSync(join(SUPABASE_DIR, name), "utf8");

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role supabase_auth_admin nologin;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );

  -- Same mechanism Supabase uses: PostgREST sets request.jwt.claims per request.
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;

  grant usage on schema auth to anon, authenticated, supabase_auth_admin;
  grant usage on schema public to anon, authenticated, supabase_auth_admin;
  -- In real Supabase supabase_auth_admin owns auth.users; select is needed for RETURNING.
  grant select, insert on auth.users to supabase_auth_admin;
`;

// Supabase grants table privileges on public to the API roles by default and
// leaves row-level security to do the restricting; mirror that so a test that
// runs as `authenticated` is limited by RLS, not by a missing GRANT.
const GRANT_PUBLIC = `
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`;

export type Db = PGlite;

export async function createDb(schemaFiles: string[]): Promise<Db> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of schemaFiles) await db.exec(sqlFile(file));
  await db.exec(GRANT_PUBLIC);
  return db;
}

export async function addUser(db: Db, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email) values ($1) returning id`,
    [email]
  );
  return rows[0].id;
}

// Run `fn` as an API caller: role `authenticated` with the given JWT claims,
// exactly as PostgREST would set them. Always resets afterwards so one test's
// identity can't leak into the next.
export async function asUser<T>(
  db: Db,
  claims: { sub: string; email?: string } | null,
  fn: () => Promise<T>,
  role: "authenticated" | "anon" = "authenticated"
): Promise<T> {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify(claims ?? {}),
  ]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

// Resolves to the Postgres error message, or null if the statement succeeded.
export async function errorOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
