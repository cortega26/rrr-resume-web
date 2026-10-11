/**
 * Public API contracts for RRR Resume QA.
 *
 * DRAFT — FROZEN, DO NOT BUILD ON: these types are hand-maintained and
 * already diverge from the backend `resume-qa-v1` contract. They must be
 * replaced by types generated from the backend OpenAPI schema once the
 * private facade exposes one. No functional UI may depend on this file
 * until then.
 *
 * These types are derived from the private backend but expose only
 * product-safe fields. They must stay in sync with the backend OpenAPI schema.
 *
 * Version: v1
 */

/** Unique review identifier. */
export type ReviewId = string & { readonly __brand: unique symbol };

/** Review processing state. */
export type ReviewState =
  | "CREATED"
  | "UPLOADING"
  | "READY"
  | "PROCESSING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED";

/** Severity of a finding. */
export type FindingSeverity = "BLOCKING" | "ADVISORY" | "PASSED";

/** Category of a finding. */
export type FindingCategory =
  | "LAYOUT"
  | "ATS_EXTRACTION"
  | "CONTENT_INTEGRITY"
  | "CLAIM_VALIDATION"
  | "EVIDENCE_QUALITY"
  | "VISUAL_PRESENTATION"
  | "HYPERLINKS"
  | "PAGE_BALANCE"
  | "WHITESPACE";

/** Source of evidence for a finding. */
export type EvidenceType =
  | "DETERMINISTIC"
  | "EVIDENCE_BASED"
  | "MODEL_ASSISTED";

/** Scope of the finding within the document. */
export type SourceScope =
  | "DOCUMENT"
  | "PAGE"
  | "SECTION"
  | "ENTRY"
  | "BULLET"
  | "HEADER"
  | "FOOTER";

/** A single quality finding. */
export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  remediation: string;
  evidenceType: EvidenceType;
  sourceScope: SourceScope;
  /** Page number if applicable (1-indexed). */
  page?: number;
  /** Measured value for deterministic findings. */
  measuredValue?: number | string;
  /** Threshold that was violated (for deterministic findings). */
  threshold?: number | string;
}

/** Result of a deterministic hard gate. */
export interface GateResult {
  name: string;
  status: "PASS" | "FAIL";
  measuredValue: number | string;
  threshold: number | string;
  explanation: string;
}

/** Artifact produced by the review. */
export interface Artifact {
  type: "PDF" | "DOCX" | "QA_REPORT" | "MEASUREMENTS";
  state: "READY" | "PROCESSING" | "FAILED";
  /** Safe download reference (signed URL or relative path). */
  downloadRef: string;
  /** Size in bytes. */
  sizeBytes?: number;
  /** SHA-256 hash for integrity verification. */
  sha256?: string;
}

/** Summary of the review. */
export interface ReviewSummary {
  totalFindings: number;
  blockingCount: number;
  advisoryCount: number;
  passedCount: number;
  gateResults: GateResult[];
  overallStatus: "BLOCKING" | "ADVISORY" | "CLEAR";
}

/** Complete review response. */
export interface ReviewResponse {
  id: ReviewId;
  state: ReviewState;
  createdAt: string; // ISO 8601
  completedAt?: string; // ISO 8601
  summary: ReviewSummary;
  findings: Finding[];
  artifacts: Artifact[];
}

/** Request to create a new review. */
export interface CreateReviewRequest {
  /** Optional vacancy context for tailored review. */
  vacancy?: {
    url?: string;
    description?: string;
    title?: string;
    company?: string;
  };
  /** Processing options. */
  options?: {
    /** Run visual critique (requires multimodal model). */
    visualCritique?: boolean;
    /** Run claim validation against candidate evidence. */
    claimValidation?: boolean;
    /** Maximum pages to analyze. */
    maxPages?: number;
  };
}

/** Response from creating a review. */
export interface CreateReviewResponse {
  id: ReviewId;
  state: ReviewState;
  uploadUrl?: string; // Signed URL for direct upload
  uploadExpiresAt?: string;
}

/** Request to upload a document. */
export interface UploadDocumentRequest {
  reviewId: ReviewId;
  file: File;
  /** Document type hint. */
  type: "CV" | "VACANCY";
}

/** Request to start review processing. */
export interface RunReviewRequest {
  reviewId: ReviewId;
}

/** Error response. */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Health check response. */
export interface HealthResponse {
  status: "healthy" | "degraded";
  version: string;
  backend: "private-rrr";
}