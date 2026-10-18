import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import LoginPage from "@/app/login/page";
import SignupPage from "@/app/signup/page";

// The pages are where an attacker-writable ?next= first meets the app, so the
// validation has to hold HERE, not only further down the chain. Server
// components are plain async functions; the returned element's props are what
// the form will receive.
const propsOf = (el: unknown) => (el as ReactElement<Record<string, unknown>>).props;

describe("/login", () => {
  it("passes a same-site destination through to the form", async () => {
    const props = propsOf(await LoginPage({ searchParams: Promise.resolve({ next: "/feed?share=https%3A%2F%2Fx.com" }) }));
    expect(props.next).toBe("/feed?share=https%3A%2F%2Fx.com");
    expect(props.mode).toBe("signin");
  });

  it.each(["//evil.com", "https://evil.com", "javascript:alert(1)", "/login", "/api/articles", ""])(
    "drops the unsafe next=%j",
    async (next) => {
      const props = propsOf(await LoginPage({ searchParams: Promise.resolve({ next }) }));
      expect(props.next).toBeUndefined();
    }
  );

  it("drops a repeated ?next= (an array) rather than guessing which to trust", async () => {
    const props = propsOf(await LoginPage({ searchParams: Promise.resolve({ next: ["/feed", "//evil.com"] }) }));
    expect(props.next).toBeUndefined();
  });

  it("still maps ?error= through the fixed table and ignores unknown codes", async () => {
    const known = propsOf(await LoginPage({ searchParams: Promise.resolve({ error: "expired" }) }));
    expect(known.notice).toMatch(/session ended/i);
    const unknown = propsOf(await LoginPage({ searchParams: Promise.resolve({ error: "<script>x</script>" }) }));
    expect(unknown.notice).toBeNull();
  });

  it("works with no query string at all", async () => {
    const props = propsOf(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(props.next).toBeUndefined();
    expect(props.notice).toBeNull();
  });
});

describe("/signup", () => {
  it("keeps a same-site destination, in sign-up mode", async () => {
    const props = propsOf(await SignupPage({ searchParams: Promise.resolve({ next: "/share?url=https%3A%2F%2Fx.com" }) }));
    expect(props.next).toBe("/share?url=https%3A%2F%2Fx.com");
    expect(props.mode).toBe("signup");
  });

  it.each(["//evil.com", "https://evil.com", "/signup", ""])("drops the unsafe next=%j", async (next) => {
    const props = propsOf(await SignupPage({ searchParams: Promise.resolve({ next }) }));
    expect(props.next).toBeUndefined();
  });
});
