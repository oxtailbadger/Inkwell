import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Auth emails are authored here but live in the Supabase dashboard
// (Authentication → Emails), where nothing checks them. A typo in a template
// variable ships as a blank link; a hardcoded domain quietly breaks the next
// time the site moves. This pins the properties that have actually bitten us.

const DIR = join(process.cwd(), "supabase", "email-templates");
const templates = readdirSync(DIR)
  .filter((f) => f.endsWith(".html"))
  .map((f) => [f, readFileSync(join(DIR, f), "utf8")] as const);

// What Supabase's Go templates expose for auth emails
const KNOWN_VARIABLES = new Set([
  "ConfirmationURL",
  "Token",
  "TokenHash",
  "SiteURL",
  "RedirectTo",
  "Email",
  "NewEmail",
  "OldEmail",
  "Data",
]);

// The sign-in form accepts a code if the flow can verify one. The call lives in
// lib/auth-flow.ts (AuthForm reaches it through verifyCode), so check both.
const loginSources = ["components/AuthForm.tsx", "lib/auth-flow.ts"]
  .map((f) => readFileSync(join(process.cwd(), f), "utf8"))
  .join("\n");
// `.auth.verifyOtp(` is the call site; a bare `verifyOtp(` would also match the type declaration
const formAcceptsCode = /\.auth\.verifyOtp\(/.test(loginSources);

describe("email templates", () => {
  it("found the templates we expect", () => {
    expect(templates.map(([f]) => f).sort()).toEqual(["confirm-signup.html", "magic-link.html"]);
  });

  describe.each(templates)("%s", (_file, html) => {
    it("links through {{ .ConfirmationURL }} (as the button and as the paste-in fallback)", () => {
      const uses = html.match(/\{\{\s*\.ConfirmationURL\s*\}\}/g) ?? [];
      expect(uses.length).toBeGreaterThanOrEqual(2);
    });

    it("only references variables Supabase actually provides (a typo renders blank)", () => {
      const vars = [...html.matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)].map((m) => m[1]);
      expect(vars.length).toBeGreaterThan(0);
      for (const v of vars) expect(KNOWN_VARIABLES, `{{ .${v} }}`).toContain(v);
      // and nothing that isn't a plain variable reference (no logic that could fail to render)
      expect(html.match(/\{\{[^}]*\}\}/g)!.every((t) => /^\{\{\s*\.\w+\s*\}\}$/.test(t))).toBe(true);
    });

    it("doesn't hardcode a domain — links must follow the Site URL, not a baked-in host", () => {
      expect(html).not.toMatch(/inkwell-reads/i);
      expect(html).not.toMatch(/supabase\.co/i);
      expect(html).not.toMatch(/vercel\.app/i);
      expect(html).not.toMatch(/localhost/i);
    });

    it("has no scripts, remote images, or remote stylesheets (blocked by clients, and a spam signal)", () => {
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<img/i);
      expect(html).not.toMatch(/<link\b/i);
      expect(html).not.toMatch(/url\(\s*['"]?https?:/i);
    });

    it("stays well under Gmail's ~102 KB clipping limit", () => {
      expect(Buffer.byteLength(html)).toBeLessThan(40_000);
    });

    it("warns that the link only works in the browser that asked for it, and points to the code for other devices", () => {
      // The link is PKCE-bound to the requesting browser, which is what broke
      // sign-up for people who asked on one device and opened the email on
      // another (or from inside Instagram's in-app browser). The code works
      // anywhere, so the email has to say both things.
      expect(html).toMatch(/link only works in the browser you asked for it from/i);
      expect(html).toMatch(/enter the code/i);
    });

    it("shows a sign-in code if and only if the login form can accept one", () => {
      // The 2026-07-10 bug in one line: a code box with no code in the email
      // (or a code in the email with nowhere to type it) is worse than neither.
      const emailShowsCode = /\{\{\s*\.Token\s*\}\}/.test(html);
      expect(emailShowsCode).toBe(formAcceptsCode);
    });
  });
});
