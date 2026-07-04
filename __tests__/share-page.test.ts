import { describe, it, expect, vi } from "vitest";

// redirect() normally throws NEXT_REDIRECT; mirror that so the page's
// control flow (nothing runs after redirect) matches production
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import SharePage from "@/app/share/page";

async function shareResult(params: { url?: string; text?: string; title?: string }) {
  try {
    await SharePage({ searchParams: Promise.resolve(params) });
    return null;
  } catch (e) {
    return (e as Error).message.replace("REDIRECT:", "");
  }
}

describe("share target landing page", () => {
  it("forwards a URL from the url param", async () => {
    expect(await shareResult({ url: "https://www.theatlantic.com/a" })).toBe(
      "/feed?share=https%3A%2F%2Fwww.theatlantic.com%2Fa"
    );
  });

  it("extracts a URL buried in the text param (common on Android)", async () => {
    expect(
      await shareResult({ text: "Check this out https://example.com/article?id=1 so good" })
    ).toBe("/feed?share=https%3A%2F%2Fexample.com%2Farticle%3Fid%3D1");
  });

  it("prefers url over text when both are present", async () => {
    expect(
      await shareResult({ url: "https://a.com/1", text: "also https://b.com/2" })
    ).toBe("/feed?share=https%3A%2F%2Fa.com%2F1");
  });

  it("falls back to the title param", async () => {
    expect(await shareResult({ title: "https://c.com/3" })).toBe(
      "/feed?share=https%3A%2F%2Fc.com%2F3"
    );
  });

  it("redirects to the plain feed when no URL is found anywhere", async () => {
    expect(await shareResult({ text: "no link here" })).toBe("/feed");
    expect(await shareResult({})).toBe("/feed");
  });
});
