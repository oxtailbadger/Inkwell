import { describe, it, expect } from "vitest";
import { ValidationError, validateHttpUrl, validateTags, validateText } from "@/lib/validate";

describe("validateHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(validateHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(validateHttpUrl("http://example.com")).toBe("http://example.com");
  });

  it("returns null for empty/absent optional values", () => {
    expect(validateHttpUrl(null)).toBeNull();
    expect(validateHttpUrl(undefined)).toBeNull();
    expect(validateHttpUrl("")).toBeNull();
  });

  it("throws when required and missing", () => {
    expect(() => validateHttpUrl(null, { required: true })).toThrow(ValidationError);
  });

  it("rejects javascript: URLs", () => {
    expect(() => validateHttpUrl("javascript:alert(1)")).toThrow(ValidationError);
  });

  it("rejects data: URLs", () => {
    expect(() => validateHttpUrl("data:text/html,<script>alert(1)</script>")).toThrow(ValidationError);
  });

  it("rejects malformed strings", () => {
    expect(() => validateHttpUrl("not a url")).toThrow(ValidationError);
  });

  it("rejects non-string input", () => {
    expect(() => validateHttpUrl(12345)).toThrow(ValidationError);
  });

  it("rejects URLs over the length cap", () => {
    const longUrl = "https://example.com/" + "a".repeat(2000);
    expect(() => validateHttpUrl(longUrl)).toThrow(ValidationError);
  });
});

describe("validateText", () => {
  it("trims and returns text within the limit", () => {
    expect(validateText("  hello  ", 10, "Field")).toBe("hello");
  });

  it("returns null for empty/absent values", () => {
    expect(validateText(null, 10, "Field")).toBeNull();
    expect(validateText("", 10, "Field")).toBeNull();
  });

  it("throws when over the length limit", () => {
    expect(() => validateText("x".repeat(11), 10, "Field")).toThrow(ValidationError);
  });
});

describe("validateTags", () => {
  it("lowercases tags", () => {
    expect(validateTags(["Politics", "TECH"])).toEqual(["politics", "tech"]);
  });

  it("defaults to an empty array", () => {
    expect(validateTags(null)).toEqual([]);
    expect(validateTags(undefined)).toEqual([]);
  });

  it("throws when given more than 12 tags", () => {
    expect(() => validateTags(Array.from({ length: 13 }, (_, i) => `t${i}`))).toThrow(ValidationError);
  });

  it("throws on a non-array value", () => {
    expect(() => validateTags("politics")).toThrow(ValidationError);
  });

  it("throws on an empty-string tag", () => {
    expect(() => validateTags([""])).toThrow(ValidationError);
  });
});
