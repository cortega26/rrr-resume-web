/**
 * API client for RRR Resume QA public frontend.
 *
 * All communication with the private backend goes through this client.
 * The backend URL is configured via VITE_API_BASE_URL environment variable.
 */

import type {
  ReviewId,
  ReviewState,
  ReviewResponse,
  CreateReviewRequest,
  CreateReviewResponse,
  HealthResponse,
} from "./api-types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

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

  /** Create a new review session. */
  async createReview(request: CreateReviewRequest): Promise<CreateReviewResponse> {
    const response = await fetch(`${API_BASE_URL}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<CreateReviewResponse>(response);
  },

  /** Get review status and results. */
  async getReview(reviewId: ReviewId): Promise<ReviewResponse> {
    const response = await fetch(`${API_BASE_URL}/reviews/${reviewId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    return handleResponse<ReviewResponse>(response);
  },

  /** Upload a document for a review. */
  async uploadDocument(
    reviewId: ReviewId,
    file: File,
    type: "CV" | "VACANCY"
  ): Promise<void> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);

    const response = await fetch(`${API_BASE_URL}/reviews/${reviewId}/documents`, {
      method: "POST",
      body: formData,
    });
    await handleResponse<void>(response);
  },

  /** Start review processing. */
  async runReview(reviewId: ReviewId): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/reviews/${reviewId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await handleResponse<void>(response);
  },

  /** Download an artifact. */
  async downloadArtifact(reviewId: ReviewId, artifactType: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/reviews/${reviewId}/artifacts/${artifactType}`, {
      method: "GET",
    });
    if (!response.ok) {
      throw new ApiError("DOWNLOAD_FAILED", "Failed to download artifact");
    }
    return response.blob();
  },

  /** Poll review until completion or timeout. */
  async pollReview(
    reviewId: ReviewId,
    options: {
      intervalMs?: number;
      timeoutMs?: number;
      onProgress?: (state: ReviewState) => void;
    } = {}
  ): Promise<ReviewResponse> {
    const { intervalMs = 2000, timeoutMs = 120000, onProgress } = options;
    const startTime = Date.now();

    while (true) {
      const review = await this.getReview(reviewId);
      onProgress?.(review.state);

      if (review.state === "COMPLETED" || review.state === "FAILED") {
        return review;
      }

      if (Date.now() - startTime > timeoutMs) {
        throw new ApiError("POLL_TIMEOUT", "Review processing timed out");
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  },
};

export { ApiError };
export type { ReviewId, ReviewState, ReviewResponse, CreateReviewRequest, CreateReviewResponse };