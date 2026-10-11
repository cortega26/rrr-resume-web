import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "./api-client";
import type { ReviewId } from "./api-types";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(handler: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(handler));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ApiError", () => {
  it("carries code, message, and details", () => {
    const err = new ApiError("POLL_TIMEOUT", "timed out", { reviewId: "r1" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
    expect(err.code).toBe("POLL_TIMEOUT");
    expect(err.message).toBe("timed out");
    expect(err.details).toEqual({ reviewId: "r1" });
  });
});

describe("api.health", () => {
  it("returns the parsed body on success", async () => {
    mockFetch(async () =>
      jsonResponse({ status: "healthy", version: "v1", backend: "private-rrr" })
    );
    await expect(api.health()).resolves.toEqual({
      status: "healthy",
      version: "v1",
      backend: "private-rrr",
    });
  });

  it("throws the backend error code on failure", async () => {
    mockFetch(async () =>
      jsonResponse({ code: "AUTH_REQUIRED", message: "denied" }, 401)
    );
    await expect(api.health()).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      message: "denied",
    });
  });

  it("falls back to the HTTP status when the body is not JSON", async () => {
    mockFetch(
      async () => new Response("boom", { status: 500, statusText: "Server Error" })
    );
    await expect(api.health()).rejects.toMatchObject({ code: "HTTP_500" });
  });
});

describe("api.pollReview", () => {
  it("times out when the review never completes", async () => {
    mockFetch(async () => jsonResponse({ state: "PROCESSING" }));
    await expect(
      api.pollReview("r1" as ReviewId, { intervalMs: 1, timeoutMs: 20 })
    ).rejects.toMatchObject({ code: "POLL_TIMEOUT" });
  });
});
