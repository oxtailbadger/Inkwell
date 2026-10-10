import { describe, it, expect } from "vitest";
import { authNotice } from "@/lib/auth-messages";

describe("authNotice", () => {
  it("explains a link that failed to exchange (the cross-device case)", () => {
    const text = authNotice("auth");
    expect(text).toMatch(/same browser/i);
    expect(text).toMatch(/new one/i);
  });

  it("explains an ended session", () => {
    expect(authNotice("expired")).toMatch(/session ended/i);
  });

  it("returns null when there is no error", () => {
    expect(authNotice(undefined)).toBeNull();
  });

  // The query string is attacker-controllable: only fixed codes may resolve.
  it.each([
    ["an arbitrary string", "<script>alert(1)</script>"],
    ["free text that looks like a message", "Your account was suspended, call 555-0100"],
    ["an empty string", ""],
    ["a repeated param (array)", ["auth", "expired"]],
    // Object-prototype keys — would resolve to a function if looked up on a plain object
    ["constructor", "constructor"],
    ["__proto__", "__proto__"],
    ["toString", "toString"],
    ["hasOwnProperty", "hasOwnProperty"],
  ])("ignores %s", (_label, value) => {
    expect(authNotice(value as string)).toBeNull();
  });
});
