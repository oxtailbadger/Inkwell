import { vi } from "vitest";

// next/headers is only available inside the Next.js runtime; stub it for tests
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    getAll: () => [],
    set: vi.fn(),
  })),
}));
