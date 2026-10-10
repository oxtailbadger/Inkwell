import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, goToLogin, SessionExpiredError } from "@/lib/api-client";

// Node environment: there's no window or fetch, so both are stubbed. This pins
// the contract the 14 call sites rely on — a 401 means "go sign in again", and
// *everything else* is the caller's business, untouched.

const assign = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { origin: "https://inkwell.test", assign } });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const respond = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("apiFetch", () => {
  it("on 401: navigates to /login with the session-ended notice and throws SessionExpiredError", async () => {
    fetchMock.mockResolvedValue(respond(401, { error: "Unauthorized" }));

    await expect(apiFetch("/api/nods", { method: "POST" })).rejects.toBeInstanceOf(SessionExpiredError);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("https://inkwell.test/login?error=expired");
  });

  it("passes the request through to fetch unchanged", async () => {
    fetchMock.mockResolvedValue(respond(200));
    const init = { method: "PATCH", body: "{}" };
    await apiFetch("/api/article-state", init);
    expect(fetchMock).toHaveBeenCalledWith("/api/article-state", init);
  });

  it.each([200, 201, 400, 403, 404, 422, 429, 500])(
    "returns a %i untouched — only 401 means the session ended",
    async (status) => {
      const res = respond(status, { ok: true });
      fetchMock.mockResolvedValue(res);
      await expect(apiFetch("/api/articles")).resolves.toBe(res);
      expect(assign).not.toHaveBeenCalled();
    }
  );

  it("lets a network failure propagate as-is (not mistaken for an expired session)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiFetch("/api/articles")).rejects.toThrow("Failed to fetch");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("goToLogin", () => {
  it("goes to a bare /login when no reason is given (e.g. sign-out)", () => {
    goToLogin();
    expect(assign).toHaveBeenCalledWith("https://inkwell.test/login");
  });

  it("uses the current origin, so it works on any domain", () => {
    vi.stubGlobal("window", { location: { origin: "https://reads.example.org", assign } });
    goToLogin("expired");
    expect(assign).toHaveBeenCalledWith("https://reads.example.org/login?error=expired");
  });
});
