import { describe, it, expect } from "vitest";
import { isPaywalled } from "@/lib/paywall";

// A description long enough (>=80 chars) to not trip the short-teaser rule
const FREE_DESC =
  "A long and detailed description of an article that is freely available to anyone who wants to read it in full.";

describe("isPaywalled", () => {
  it("passes a normal free article", () => {
    expect(isPaywalled({ title: "Free piece", contentSnippet: FREE_DESC })).toBe(false);
  });

  it("passes an item with no description at all (empty is not a teaser)", () => {
    expect(isPaywalled({ title: "No desc" })).toBe(false);
    expect(isPaywalled({ title: "Empty desc", contentSnippet: "" })).toBe(false);
  });

  it("flags Stratechery paid categories, case-insensitively", () => {
    expect(isPaywalled({ contentSnippet: FREE_DESC, categories: ["Daily Update"] })).toBe(true);
    expect(
      isPaywalled({ contentSnippet: FREE_DESC, categories: ["This Week in Stratechery"] })
    ).toBe(true);
  });

  it("does not flag unrelated categories", () => {
    expect(isPaywalled({ contentSnippet: FREE_DESC, categories: ["Weekly Article"] })).toBe(false);
  });

  it("keeps a free 'Articles' post with a short teaser (length fallback must not override the free category)", () => {
    // Regression: Stratechery's free weekly essays are category "Articles" but
    // sometimes have a <80-char RSS snippet, which previously hid them.
    expect(
      isPaywalled({
        title: "A Script for Mark Zuckerberg",
        contentSnippet: "A short teaser under eighty characters.",
        categories: ["Articles"],
      })
    ).toBe(false);
  });

  it("still flags a paid item even if it also carries a free category", () => {
    // Explicit paid signals win over the free-category exemption.
    expect(
      isPaywalled({ contentSnippet: FREE_DESC, categories: ["Articles", "Daily Update"] })
    ).toBe(true);
  });

  it("flags Substack paid-subscriber markers in the description", () => {
    expect(
      isPaywalled({
        contentSnippet: `Some preamble text and then: Thank you for being a paid subscriber! ${FREE_DESC}`,
      })
    ).toBe(true);
    expect(
      isPaywalled({ contentSnippet: `${FREE_DESC} This post is for paid subscribers.` })
    ).toBe(true);
  });

  it("flags a short truncated description as a paid teaser", () => {
    expect(isPaywalled({ contentSnippet: "A short teaser." })).toBe(true);
  });

  it("treats exactly-80-char descriptions as free (boundary)", () => {
    expect(isPaywalled({ contentSnippet: "x".repeat(80) })).toBe(false);
    expect(isPaywalled({ contentSnippet: "x".repeat(79) })).toBe(true);
  });
});
