import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "./api-client";
import type { CVMeasurements, ReviewResult } from "./api-client";

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

const MEASURED: CVMeasurements = {
  page_count: 2,
  header_alignments: ["center"],
  full_header_pages: [1],
  body_left_margin_mm: 18,
  bottom_whitespace_mm: [23, 18],
  links_clickable: true,
  text_extractable: true,
};

const REVIEW: ReviewResult = {
  api_version: "resume-qa-v1",
  id: "r1",
  status: "COMPLETED",
  stage: "COMPLETE",
  created_at: "2026-10-11T00:00:00Z",
  summary: "All hard gates passed.",
  findings: [],
  gates: [],
  artifacts: [],
};

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
      jsonResponse({ status: "ok", api_version: "resume-qa-v1" })
    );
    await expect(api.health()).resolves.toEqual({
      status: "ok",
      api_version: "resume-qa-v1",
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

describe("api.previewReview", () => {
  it("posts review_id and measured in backend shape", async () => {
    const calls: { url: unknown; init: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init: unknown) => {
        calls.push({ url, init });
        return jsonResponse(REVIEW);
      })
    );
    await expect(api.previewReview("r1", MEASURED)).resolves.toEqual(REVIEW);
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.url)).toMatch(/\/reviews\/preview$/);
    expect(JSON.parse(String((calls[0]?.init as RequestInit)?.body))).toEqual({
      review_id: "r1",
      measured: MEASURED,
    });
  });

  it("maps backend validation errors to ApiError", async () => {
    mockFetch(async () =>
      jsonResponse({ detail: "review_id must not be blank" }, 422)
    );
    await expect(api.previewReview("   ", MEASURED)).rejects.toMatchObject({
      code: "HTTP_422",
    });
  });
});
