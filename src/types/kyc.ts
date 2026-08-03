// Types for player KYC identity verification

import type { KycRetryReasonCode } from "@/lib/kyc/retryReasons";

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
  rejectionReasonCode: string | null;
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

export interface KycNotificationResponse {
  hasNotification: boolean;
  submissionId: string | null;
  kind: "approved" | "rejected" | null;
  rejectionReasonCode: KycRetryReasonCode | string | null;
  rejectionReasonLabel: string | null;
}

export interface AdminKycListItem {
  id: string;
  userId: string;
  username: string;
  kycCode: string;
  agentUsername: string | null;
  superUsername: string | null;
  imageDataUrl: string;
  imageMimeType: string;
  createdAt: string;
  declarationText: string;
  status: "pending_review" | "approved";
  hasImage: boolean;
}

export interface AdminKycListResponse {
  items: AdminKycListItem[];
}

export interface AdminKycReviewRequest {
  submissionId: string;
  action: "approve" | "retry";
  reasonCode?: KycRetryReasonCode;
}

export interface AdminKycPurgeImageRequest {
  submissionId: string;
}
