import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIMITS } from "@/lib/validate";

// The same limits are enforced twice: in lib/validate.ts (friendly API errors)
// and in supabase/content-constraints.sql (the part a direct PostgREST write
// can't skip). Nothing connects them at runtime, so this test is the only
// thing that stops them silently drifting apart — e.g. raising a limit in
// TypeScript while the database keeps rejecting what the API now accepts.

const sql = (file: string) => readFileSync(join(process.cwd(), "supabase", file), "utf8");
const constraints = sql("content-constraints.sql");

describe("content-constraints.sql stays in sync with lib/validate.ts", () => {
  it.each([
    ["url", LIMITS.URL],
    ["image_url", LIMITS.URL],
    ["site_icon_url", LIMITS.URL],
    ["archive_url", LIMITS.URL],
    ["title", LIMITS.TITLE],
    ["description", LIMITS.DESCRIPTION],
    ["site_name", LIMITS.SITE_NAME],
  ])("caps %s at the API limit (%i)", (column, limit) => {
    expect(constraints).toContain(`char_length(${column}) <= ${limit}`);
  });

  it("caps display_name and feedback message at the API limits", () => {
    expect(constraints).toContain(`char_length(display_name) between 1 and ${LIMITS.DISPLAY_NAME}`);
    expect(constraints).toContain(`char_length(message) between 1 and ${LIMITS.FEEDBACK}`);
  });

  it("caps tag count at the API limit", () => {
    expect(constraints).toContain(`coalesce(cardinality(tags), 0) <= ${LIMITS.TAGS}`);
  });

  it("bounds total tag size at least as loosely as TAGS x TAG_LENGTH (never stricter than the API)", () => {
    const m = constraints.match(/array_to_string\(tags, ','\), ''\)\) <= (\d+)/);
    expect(m, "tag total-size bound not found").not.toBeNull();
    const bound = Number(m![1]);
    const apiMax = LIMITS.TAGS * LIMITS.TAG_LENGTH + (LIMITS.TAGS - 1); // joined by commas
    // >= : a legitimate max-size tag list must still be accepted
    expect(bound).toBeGreaterThanOrEqual(apiMax);
    // but not wildly looser, or the cap means nothing
    expect(bound).toBeLessThanOrEqual(apiMax * 2);
  });

  it("requires http(s) on every URL column the app renders as a link or image", () => {
    for (const column of ["url", "image_url", "site_icon_url", "archive_url"]) {
      expect(constraints).toMatch(new RegExp(`${column} ~\\* '\\^https\\?://'`));
    }
  });

  it("signup trigger truncates the default display name to the display-name limit (both files)", () => {
    // If the trigger can emit a longer name than the constraint allows, signup
    // itself fails for long email addresses.
    const truncate = `left(split_part(new.email, '@', 1), ${LIMITS.DISPLAY_NAME})`;
    expect(constraints).toContain(truncate);
    expect(sql("profiles-schema.sql")).toContain(truncate);
  });
});
