import { describe, it, expect } from "vitest";
import { SECTIONS, SECTION_LABEL, VIEWS, VIEW_LABEL, isSection, parseSection, parseView, sectionOfKind } from "@/lib/sections";

describe("lib/sections", () => {
  it("has All (the default), Articles and Podcasts, each with a label", () => {
    expect(SECTIONS).toEqual(["all", "articles", "podcasts"]);
    expect(SECTIONS.every((s) => SECTION_LABEL[s])).toBe(true);
  });

  it("isSection is strict", () => {
    expect(isSection("podcasts")).toBe(true);
    expect(isSection("all")).toBe(true);
    for (const v of ["Podcasts", "podcast", "", null, undefined, 1, {}, "toString", "__proto__"]) {
      expect(isSection(v)).toBe(false);
    }
  });

  it("parseSection falls back to All for anything unrecognised (page URLs are user-editable)", () => {
    expect(parseSection("podcasts")).toBe("podcasts");
    expect(parseSection("articles")).toBe("articles");
    for (const v of [null, undefined, "", "videos", "PODCASTS", "constructor"]) {
      expect(parseSection(v)).toBe("all");
    }
  });

  it("maps a row's kind to the list it lives in (never 'all')", () => {
    expect(sectionOfKind("podcast")).toBe("podcasts");
    expect(sectionOfKind("article")).toBe("articles");
    expect(sectionOfKind(undefined)).toBe("articles"); // before sections.sql has run
    expect(sectionOfKind("whatever")).toBe("articles");
  });

  it("Authors is a view, not a section: the API/database never accept it", () => {
    expect(VIEWS).toEqual(["all", "articles", "podcasts", "authors"]);
    expect(VIEWS.every((v) => VIEW_LABEL[v])).toBe(true);
    expect(isSection("authors")).toBe(false);
    expect(parseSection("authors")).toBe("all");
    expect(parseView("authors")).toBe("authors");
    expect(parseView("podcasts")).toBe("podcasts");
    for (const v of [null, undefined, "", "Authors", "videos"]) expect(parseView(v)).toBe("all");
  });
});
