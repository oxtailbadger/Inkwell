import { describe, it, expect } from "vitest";
import { SECTIONS, SECTION_KIND, SECTION_LABEL, isSection, parseSection, sectionOfKind } from "@/lib/sections";

describe("lib/sections", () => {
  it("knows exactly the two sections", () => {
    expect(SECTIONS).toEqual(["articles", "podcasts"]);
    expect(SECTIONS.every((s) => SECTION_LABEL[s])).toBe(true);
  });

  it("isSection is strict", () => {
    expect(isSection("podcasts")).toBe(true);
    for (const v of ["Podcasts", "podcast", "", null, undefined, 1, {}, "toString", "__proto__"]) {
      expect(isSection(v)).toBe(false);
    }
  });

  it("parseSection falls back to articles for anything unrecognised (page URLs are user-editable)", () => {
    expect(parseSection("podcasts")).toBe("podcasts");
    for (const v of [null, undefined, "", "videos", "PODCASTS", "constructor"]) {
      expect(parseSection(v)).toBe("articles");
    }
  });

  it("maps a row's kind back to its section, and every section to a distinct kind", () => {
    expect(sectionOfKind("podcast")).toBe("podcasts");
    expect(sectionOfKind("article")).toBe("articles");
    expect(sectionOfKind(undefined)).toBe("articles"); // before sections.sql has run
    expect(sectionOfKind("whatever")).toBe("articles");
    expect(new Set(SECTIONS.map((s) => SECTION_KIND[s])).size).toBe(SECTIONS.length);
    for (const s of SECTIONS) expect(sectionOfKind(SECTION_KIND[s])).toBe(s);
  });
});
