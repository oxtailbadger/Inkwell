import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, addUser, errorOf, sqlFile, type Db } from "./helpers/pg";

// Executes supabase/content-constraints.sql against real Postgres. The sibling
// db-constraints.test.ts only reads that file as text to catch drift from
// lib/validate.ts; this one proves the constraints actually accept what the API
// accepts and reject what it must — including the signup trigger, which the
// display-name constraint would otherwise break.

const BASE_SCHEMA = ["schema.sql", "profiles-schema.sql", "feedback-schema.sql"];

let db: Db;
let userId: string;

beforeAll(async () => {
  db = await createDb(BASE_SCHEMA);
  userId = await addUser(db, "paul@example.com");

  // A pre-existing row that violates the new rules, inserted BEFORE the
  // constraints exist: models "your live DB already has data".
  await db.query(
    `insert into public.articles (url, title, submitted_by) values ('https://old.example/a', $1, $2)`,
    ["T".repeat(600), userId]
  );
  await db.exec(sqlFile("content-constraints.sql"));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const article = (o: Record<string, unknown>) => {
  const row = { url: "https://example.com/x", ...o };
  const cols = Object.keys(row);
  return db.query(
    `insert into public.articles (${cols.join(",")}, submitted_by)
     values (${cols.map((_, i) => `$${i + 1}`).join(",")}, '${userId}')`,
    cols.map((c) => row[c as keyof typeof row])
  );
};

const longUrl = "https://example.com/" + "a".repeat(2001 - 20);
const tags = (n: number, len = 3) => Array.from({ length: n }, (_, i) => String(i % 10).repeat(len));

describe("applying the file", () => {
  it("succeeded over existing violating data, and is idempotent", async () => {
    await expect(db.exec(sqlFile("content-constraints.sql"))).resolves.not.toThrow();
  });

  it("(NOT VALID) left the pre-existing violating row untouched, and VALIDATE surfaces it", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.articles where char_length(title) = 600`
    );
    expect(rows[0].n).toBe(1);
    expect(
      await errorOf(() => db.exec(`alter table public.articles validate constraint articles_title_len`))
      // VALIDATE words it differently from an INSERT ("is violated by some row")
    ).toMatch(/articles_title_len.*violated by some row/i);
  });
});

describe("articles: what the API accepts must be accepted", () => {
  it.each([
    ["valid https article", { title: "Hi", tags: ["tech"] }],
    ["uppercase scheme HTTPS://", { url: "HTTPS://EXAMPLE.COM/x" }],
    ["a space in the path (validateHttpUrl allows it)", { url: "https://example.com/a b" }],
    ["title exactly at the 500 limit", { title: "x".repeat(500) }],
    ["12 tags x 40 chars (the API maximum)", { tags: tags(12, 40) }],
    ["empty tags", { tags: [] }],
    ["every optional field null", { title: null, description: null, image_url: null, site_icon_url: null, archive_url: null, site_name: null }],
  ])("%s", async (_label, row) => {
    expect(await errorOf(() => article(row))).toBeNull();
  });
});

describe("articles: what a direct PostgREST write must NOT be able to store", () => {
  it.each([
    ["url = javascript:", { url: "javascript:alert(1)" }],
    ["url = data:", { url: "data:text/html,<script>1</script>" }],
    ["url = ftp://", { url: "ftp://example.com/x" }],
    ["url over 2000 chars", { url: longUrl }],
    ["title over 500", { title: "x".repeat(501) }],
    ["description over 2000", { description: "x".repeat(2001) }],
    ["site_name over 200", { site_name: "x".repeat(201) }],
    ["image_url = javascript:", { image_url: "javascript:alert(1)" }],
    ["image_url = data: URI", { image_url: "data:image/svg+xml;base64,PHN2Zy8+" }],
    ["site_icon_url = ftp://", { site_icon_url: "ftp://x/y.png" }],
    ["archive_url = javascript:", { archive_url: "javascript:alert(1)" }],
    ["13 tags", { tags: tags(13) }],
    ["a single 600-char tag", { tags: ["x".repeat(600)] }],
  ])("%s", async (_label, row) => {
    expect(await errorOf(() => article(row))).toMatch(/violates check constraint/i);
  });
});

describe("profiles.display_name", () => {
  let id: string;
  beforeAll(async () => {
    id = await addUser(db, "named@example.com");
  });
  const rename = (name: string) =>
    db.query(`update public.profiles set display_name = $1 where id = $2`, [name, id]);

  it("accepts up to 60 chars, inner whitespace, and unicode", async () => {
    expect(await errorOf(() => rename("n".repeat(60)))).toBeNull();
    expect(await errorOf(() => rename("Zoë  O’Brien"))).toBeNull();
  });

  it.each([
    ["61 chars", "n".repeat(61)],
    ["empty", ""],
    ["spaces only", "     "],
    ["tabs/newlines only (btrim alone would miss this)", "\t\n \n"],
  ])("rejects %s", async (_label, name) => {
    expect(await errorOf(() => rename(name))).toMatch(/violates check constraint/i);
  });
});

describe("the signup trigger must never be what makes signup fail", () => {
  const nameFor = async (email: string) => {
    const uid = await addUser(db, email);
    const { rows } = await db.query<{ display_name: string }>(
      `select display_name from public.profiles where id = $1`,
      [uid]
    );
    return rows[0]?.display_name;
  };

  it("truncates a 64-char email local-part to the 60-char limit", async () => {
    const name = await nameFor(`${"a".repeat(64)}@example.com`);
    expect(name).toHaveLength(60);
  });

  it("falls back to a placeholder for an empty local-part", async () => {
    expect(await nameFor("@example.com")).toBe("user");
  });

  it("control: the ORIGINAL un-truncated trigger WOULD have broken signup", async () => {
    // Re-create the pre-fix function body, prove it fails under the
    // constraint, then restore the fixed one. This is what justifies the
    // trigger change shipping with the constraint.
    await db.exec(`
      create or replace function public.handle_new_user() returns trigger language plpgsql
      security definer set search_path = public as $$
      begin insert into public.profiles (id, display_name)
            values (new.id, split_part(new.email, '@', 1)); return new; end; $$;`);
    try {
      expect(await errorOf(() => addUser(db, `${"b".repeat(64)}@example.com`))).toMatch(
        /violates check constraint/i
      );
    } finally {
      await db.exec(sqlFile("content-constraints.sql"));
    }
    expect(await nameFor(`${"c".repeat(64)}@example.com`)).toHaveLength(60);
  });
});

describe("feedback", () => {
  const feedback = (message: string, email = "x@y.com") =>
    db.query(`insert into public.feedback (user_id, email, message) values ($1, $2, $3)`, [userId, email, message]);

  it.each([
    ["a short message", "hi"],
    ["exactly 4000 chars", "x".repeat(4000)],
    ["a multi-line message", "line one\n\nline two"],
  ])("accepts %s", async (_label, message) => {
    expect(await errorOf(() => feedback(message))).toBeNull();
  });

  it.each([
    ["empty", ""],
    ["spaces + newline only", "   \n  "],
    ["tabs only", "\t\t"],
    ["4001 chars", "x".repeat(4001)],
  ])("rejects %s", async (_label, message) => {
    expect(await errorOf(() => feedback(message))).toMatch(/violates check constraint/i);
  });

  it("rejects an email over 320 chars", async () => {
    expect(await errorOf(() => feedback("hi", "e".repeat(321)))).toMatch(/violates check constraint/i);
  });
});
