// Types for player KYC identity verification

export type KycSubmissionStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "expired"
  | "none";

export interface KycQualityChecks {
  width: number;
  height: number;
  averageBrightness: number;
  contrast: number;
  sharpness: number;
  fileSizeBytes: number;
  passed: boolean;
  failures: string[];
}

export interface KycStatusResponse {
  status: KycSubmissionStatus;
  kycCode: string | null;
  declarationText: string | null;
  submittedAt: string | null;
  rejectionReason: string | null;
  displayName: string;
}

export interface KycSubmitRequest {
  clientRequestId: string;
  kycCode: string;
  declarationText: string;
  imageBase64: string;
  imageMimeType: string;
  qualityChecks: KycQualityChecks;
}

export interface KycSubmitResponse {
  ok: true;
  status: "pending_review";
  submissionId: string;
  message: string;
}
