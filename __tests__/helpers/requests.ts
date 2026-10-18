import { NextRequest } from "next/server";

// Valid UUIDs for tests. Route handlers now reject a malformed id with a 400
// before any database call, so a test that wants to reach the database must use
// a real-shaped one ("article-abc" no longer gets that far).
export const ARTICLE_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_ID = "22222222-2222-4222-8222-222222222222";

// A request with an exact, unparsed body — for sending things JSON.stringify
// can't produce (malformed JSON, an empty body).
export function rawRequest(url: string, method: string, body: string) {
  return new NextRequest(url, { method, headers: { "Content-Type": "application/json" }, body });
}

// Bodies a route must answer with 400 — never a 500. The first two used to throw
// on `await request.json()`; the rest parse fine but aren't objects, so the old
// code died on the first property access.
export const NON_OBJECT_BODIES: [label: string, raw: string][] = [
  ["malformed JSON", "{not json"],
  ["an empty body", ""],
  ["null", "null"],
  ["an array", "[]"],
  ["a bare string", '"hello"'],
  ["a bare number", "42"],
];

// Values that aren't a UUID: wrong shape, wrong type, injection-shaped
export const BAD_IDS: [label: string, value: unknown][] = [
  ["a plain word", "article-abc"],
  ["a truncated uuid", "11111111-1111-4111-8111"],
  ["a uuid with a suffix", "11111111-1111-4111-8111-111111111111x"],
  ["filter-injection syntax", "x,id.not.is.null"],
  ["a number", 42],
  ["an object", { id: "x" }],
  ["an array", ["11111111-1111-4111-8111-111111111111"]],
];
