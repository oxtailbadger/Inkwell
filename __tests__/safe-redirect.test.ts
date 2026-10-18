import { describe, it, expect } from "vitest";
import {
  DEFAULT_AFTER_LOGIN,
  afterLoginUrl,
  authCallbackUrl,
  authPageHref,
  isSafeNextPath,
  loginRedirectPath,
  safeNextPath,
} from "@/lib/safe-redirect";

describe("isSafeNextPath / safeNextPath", () => {
  it.each([
    "/feed",
    "/feed?tag=tech",
    "/feed?share=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1",
    "/profile",
    "/share?url=https%3A%2F%2Fexample.com&text=hi",
    "/feed#articles",
  ])("accepts the same-site path %s", (p) => {
    expect(isSafeNextPath(p)).toBe(true);
    expect(safeNextPath(p)).toBe(p);
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["backslash host", "/\\evil.com"],
    ["no leading slash", "@evil.com"],
    ["absolute URL", "https://evil.com"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,x"],
    ["empty", ""],
    ["a newline (header/log injection)", "/feed\nSet-Cookie: x=1"],
    ["a carriage return", "/feed\rfoo"],
    ["a NUL byte", "/feed\u0000"],
    ["over the length limit", "/" + "a".repeat(2001)],
  ])("rejects %s and falls back to the default", (_label, value) => {
    expect(isSafeNextPath(value)).toBe(false);
    expect(safeNextPath(value)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it.each([null, undefined, 42, {}, [], ["/feed"]])("rejects the non-string %j", (value) => {
    expect(isSafeNextPath(value)).toBe(false);
    expect(safeNextPath(value)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it.each(["/login", "/login?next=/feed", "/signup", "/signup/anything", "/api/auth/callback", "/api/articles"])(
    "rejects %s — sending someone to a sign-in or API path right after signing in is a loop or a dead end",
    (p) => {
      expect(isSafeNextPath(p)).toBe(false);
    }
  );

  it("matches whole path segments, so /loginhelp and /apiary are ordinary pages", () => {
    expect(isSafeNextPath("/loginhelp")).toBe(true);
    expect(isSafeNextPath("/apiary")).toBe(true);
  });

  it("accepts a path right at the length limit", () => {
    expect(isSafeNextPath("/" + "a".repeat(1999))).toBe(true);
  });
});

describe("loginRedirectPath (what the auth gate sends a signed-out visitor to)", () => {
  it("remembers a shared link from the Android share sheet, query string and all", () => {
    expect(loginRedirectPath("/share", "?url=https%3A%2F%2Fexample.com%2Fa&text=hi")).toBe(
      "/login?next=" + encodeURIComponent("/share?url=https%3A%2F%2Fexample.com%2Fa&text=hi")
    );
  });

  it("remembers /feed with a query string, and other pages", () => {
    expect(loginRedirectPath("/feed", "?share=https%3A%2F%2Fx.com")).toBe(
      "/login?next=" + encodeURIComponent("/feed?share=https%3A%2F%2Fx.com")
    );
    expect(loginRedirectPath("/profile", "")).toBe("/login?next=%2Fprofile");
  });

  it("adds nothing when the destination is just the default, to keep the URL clean", () => {
    expect(loginRedirectPath("/feed", "")).toBe("/login");
  });

  it("adds nothing for the root, which only forwards to /feed anyway", () => {
    expect(loginRedirectPath("/", "")).toBe("/login");
  });

  it("round-trips: what it writes is exactly what the login page will read back", () => {
    const written = loginRedirectPath("/share", "?url=https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b%3D2");
    const next = new URL(written, "https://x.test").searchParams.get("next");
    expect(next).toBe("/share?url=https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b%3D2");
    expect(safeNextPath(next)).toBe(next);
  });

  it("never writes an unsafe destination (it falls back to a bare /login)", () => {
    expect(loginRedirectPath("//evil.com", "")).toBe("/login");
    expect(loginRedirectPath("/login", "?next=/feed")).toBe("/login");
  });
});

describe("afterLoginUrl (where to navigate once signed in)", () => {
  const origin = "https://inkwell-reads.xyz";
  it("goes to where they were headed, as an absolute URL on this origin", () => {
    expect(afterLoginUrl(origin, "/feed?share=https%3A%2F%2Fx.com%2Fa")).toBe(
      "https://inkwell-reads.xyz/feed?share=https%3A%2F%2Fx.com%2Fa"
    );
  });
  it.each([undefined, null, "", "//evil.com", "https://evil.com", "/login", "javascript:alert(1)"])(
    "falls back to /feed for %j — never off-site",
    (next) => {
      expect(afterLoginUrl(origin, next)).toBe("https://inkwell-reads.xyz/feed");
    }
  );
  it("can't be steered to another host even with a tricky path", () => {
    expect(new URL(afterLoginUrl(origin, "/\\evil.com")).host).toBe("inkwell-reads.xyz");
    expect(new URL(afterLoginUrl(origin, "//evil.com/x")).host).toBe("inkwell-reads.xyz");
  });
});

describe("authCallbackUrl (the redirect target in the emailed link)", () => {
  const origin = "https://inkwell-reads.xyz";
  it("is the bare callback when there's no destination, or it's just the default", () => {
    expect(authCallbackUrl(origin)).toBe("https://inkwell-reads.xyz/api/auth/callback");
    expect(authCallbackUrl(origin, "/feed")).toBe("https://inkwell-reads.xyz/api/auth/callback");
  });
  it("carries a real destination as an encoded ?next=", () => {
    const url = authCallbackUrl(origin, "/feed?share=https%3A%2F%2Fx.com%2Fa%3Fb%3D1");
    expect(url).toBe(
      "https://inkwell-reads.xyz/api/auth/callback?next=" + encodeURIComponent("/feed?share=https%3A%2F%2Fx.com%2Fa%3Fb%3D1")
    );
    // and the callback reads back exactly what was put in
    expect(new URL(url).searchParams.get("next")).toBe("/feed?share=https%3A%2F%2Fx.com%2Fa%3Fb%3D1");
  });
  it.each(["//evil.com", "https://evil.com", "/login", "/feed\nx"])("never forwards the unsafe value %j", (next) => {
    expect(authCallbackUrl(origin, next)).toBe("https://inkwell-reads.xyz/api/auth/callback");
  });
});

describe("authPageHref (the /login <-> /signup link)", () => {
  it("is the plain page with no destination, and keeps one when there is", () => {
    expect(authPageHref("/signup")).toBe("/signup");
    expect(authPageHref("/login", "/feed")).toBe("/login");
    expect(authPageHref("/signup", "/share?url=x")).toBe("/signup?next=" + encodeURIComponent("/share?url=x"));
  });
  it("drops an unsafe destination instead of passing it along", () => {
    expect(authPageHref("/login", "//evil.com")).toBe("/login");
  });
});

