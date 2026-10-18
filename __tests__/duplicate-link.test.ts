import { describe, it, expect } from "vitest";
import { duplicateLinkMessage, isDuplicateLinkError, DUPLICATE_LINK_CONSTRAINT, type ExistingShare } from "@/lib/duplicate-link";

describe("isDuplicateLinkError", () => {
  it("recognizes a unique violation on the canonical-URL index, from the message or the details", () => {
    expect(
      isDuplicateLinkError({ code: "23505", message: `duplicate key value violates unique constraint "${DUPLICATE_LINK_CONSTRAINT}"` })
    ).toBe(true);
    expect(isDuplicateLinkError({ code: "23505", message: "duplicate key", details: `constraint ${DUPLICATE_LINK_CONSTRAINT}` })).toBe(true);
  });

  it.each([
    ["a different unique constraint", { code: "23505", message: 'violates unique constraint "articles_pkey"' }],
    ["the right name but a different error class", { code: "42501", message: `permission denied for ${DUPLICATE_LINK_CONSTRAINT}` }],
    ["no code at all", { message: DUPLICATE_LINK_CONSTRAINT }],
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
  ])("does not match %s", (_label, error) => {
    expect(isDuplicateLinkError(error as never)).toBe(false);
  });
});

describe("duplicateLinkMessage", () => {
  const existing = (over: Partial<ExistingShare> = {}): ExistingShare => ({
    id: "x",
    title: "T",
    submitted_by: "other",
    shared_by: "Priya",
    created_at: "2026-07-01T00:00:00Z",
    ...over,
  });

  it("names the friend who shared it and points at a Nod", () => {
    expect(duplicateLinkMessage(existing(), "me")).toBe(
      "Priya already shared this link — find it in the feed and give it a Nod instead."
    );
  });
  it("says so plainly when it was you", () => {
    expect(duplicateLinkMessage(existing({ submitted_by: "me" }), "me")).toBe("You already shared this link.");
  });
  it("doesn't print a blank name for a friend with no display name", () => {
    for (const shared_by of [null, "", "   "]) {
      expect(duplicateLinkMessage(existing({ shared_by }), "me")).toMatch(/^A friend already shared/);
    }
  });
  it("still helps when the lookup found nothing", () => {
    expect(duplicateLinkMessage(null, "me")).toMatch(/already been shared.*Nod/);
  });
});
