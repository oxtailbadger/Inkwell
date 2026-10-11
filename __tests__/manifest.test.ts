import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "@/app/manifest";

// The manifest is a static object and can't read CSS variables, so its colors
// are literals that silently went stale when the palette changed (they stayed
// on the old amber/white after the Broadsheet redesign). This ties them back to
// the design token so a palette change fails a test instead of showing up as a
// wrong splash-screen color on someone's phone.

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
// First `--paper:` in the file is the light theme (the dark override comes later)
const lightPaper = css.match(/--paper:\s*(#[0-9a-fA-F]{6})/)?.[1]?.toLowerCase();

describe("web app manifest", () => {
  it("found the light --paper token to compare against", () => {
    expect(lightPaper).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("uses the Broadsheet paper color for the splash screen and theme", () => {
    const m = manifest();
    expect(m.background_color?.toLowerCase()).toBe(lightPaper);
    expect(m.theme_color?.toLowerCase()).toBe(lightPaper);
  });

  it("keeps the Android share target pointed at /share with the three params the page reads", () => {
    const m = manifest();
    expect(m.share_target).toMatchObject({
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    });
  });
});
