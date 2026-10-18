import { describe, it, expect } from "vitest";
import { readJsonObject, validationErrorResponse } from "@/lib/http";
import { ValidationError, validateUuid } from "@/lib/validate";
import { BAD_IDS, ARTICLE_ID, NON_OBJECT_BODIES, rawRequest } from "./helpers/requests";

describe("readJsonObject", () => {
  it("returns the parsed object for a JSON object body", async () => {
    const r = await readJsonObject(rawRequest("http://x.test/", "POST", '{"a":1,"b":[2]}'));
    expect(r).toEqual({ ok: true, body: { a: 1, b: [2] } });
  });

  it("accepts an empty object", async () => {
    expect(await readJsonObject(rawRequest("http://x.test/", "POST", "{}"))).toEqual({ ok: true, body: {} });
  });

  it.each(NON_OBJECT_BODIES)("turns %s into a 400 response with a generic message", async (_label, raw) => {
    const r = await readJsonObject(rawRequest("http://x.test/", "POST", raw));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect(await r.response.json()).toEqual({ error: "Invalid request body" });
    }
  });
});

describe("validationErrorResponse", () => {
  it("turns a ValidationError into a 400 carrying its message", async () => {
    const res = validationErrorResponse(new ValidationError("Title is too long"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title is too long" });
  });

  it("rethrows anything else — a real bug must not become a polite 400", () => {
    expect(() => validationErrorResponse(new TypeError("boom"))).toThrow("boom");
    expect(() => validationErrorResponse("a string")).toThrow();
  });
});

describe("validateUuid", () => {
  it("returns a valid uuid unchanged (any case)", () => {
    expect(validateUuid(ARTICLE_ID, "id")).toBe(ARTICLE_ID);
    expect(validateUuid(ARTICLE_ID.toUpperCase(), "id")).toBe(ARTICLE_ID.toUpperCase());
  });

  it.each([null, undefined, ""])("reports a missing value (%j) as 'required'", (v) => {
    expect(() => validateUuid(v, "article_id")).toThrow(new ValidationError("article_id required"));
  });

  it.each(BAD_IDS)("rejects %s", (_label, value) => {
    expect(() => validateUuid(value, "article_id")).toThrow(ValidationError);
    expect(() => validateUuid(value, "article_id")).toThrow(/article_id is not valid/);
  });
});
