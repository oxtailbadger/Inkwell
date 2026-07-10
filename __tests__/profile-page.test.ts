import { describe, it, expect, vi } from "vitest";

// redirect() normally throws NEXT_REDIRECT; mirror that so the page's
// control flow (nothing runs after redirect) matches production
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

function makeSupabaseMock({
  authed = true,
  profile = { display_name: "priya" } as { display_name: string } | null,
} = {}) {
  const single = vi.fn().mockResolvedValue({ data: profile, error: null });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authed ? { id: "user-123", email: "priya@example.com" } : null },
      }),
    },
    from: vi.fn(() => ({ select })),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import ProfilePage from "@/app/profile/page";

describe("profile page", () => {
  it("redirects to /login when unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authed: false }) as never);
    await expect(ProfilePage()).rejects.toThrow("REDIRECT:/login");
  });

  it("renders with the stored display_name when a profile row exists", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ profile: { display_name: "priya" } }) as never);
    const result = await ProfilePage();
    // ProfileClient receives initialDisplayName as a prop — inspect the
    // rendered element's props directly rather than rendering to DOM,
    // matching this repo's logic-level (not DOM-render) test convention
    expect(result.props.initialDisplayName).toBe("priya");
    expect(result.props.userEmail).toBe("priya@example.com");
  });

  it("falls back to the email prefix when no profile row exists yet", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ profile: null }) as never);
    const result = await ProfilePage();
    expect(result.props.initialDisplayName).toBe("priya");
  });
});
