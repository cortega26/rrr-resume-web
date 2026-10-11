/**
 * API client for RRR Resume QA public frontend.
 *
 * Speaks only the endpoints the private backend actually serves (see
 * openapi/resume-qa-v1.open.json). All types come from
 * src/lib/api-generated.ts, which is regenerated from the backend schema
 * and never hand-edited.
 *
 * Same-origin by default: the Vite dev proxy forwards /api to the loopback
 * backend, so no CORS configuration is needed. Override with
 * VITE_API_BASE_URL when the backend lives elsewhere.
 */

import type { components } from "./api-generated";

export type HealthResponse = components["schemas"]["HealthResponse"];
export type ReviewResult = components["schemas"]["ReviewResult"];
export type Finding = components["schemas"]["Finding"];
export type GateResult = components["schemas"]["GateResult"];
export type ReviewStatus = components["schemas"]["ReviewStatus"];
export type CVMeasurements = components["schemas"]["CVMeasurements"];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

class ApiError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: ApiError | undefined;
    try {
      errorData = await response.json();
    } catch {
      // Ignore parse errors
    }
    throw new ApiError(
      errorData?.code || `HTTP_${response.status}`,
      errorData?.message || response.statusText,
      errorData?.details
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export const api = {
  /** Check backend health. */
  async health(): Promise<HealthResponse> {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    return handleResponse<HealthResponse>(response);
  },

  /** Project measurements to a public review under the active contract. */
  async previewReview(
    reviewId: string,
    measured: CVMeasurements
  ): Promise<ReviewResult> {
    const response = await fetch(`${API_BASE_URL}/reviews/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_id: reviewId, measured }),
    });
    return handleResponse<ReviewResult>(response);
  },
};

export { ApiError };
