// Types for entry banner management

export type BannerContentType = "text" | "image";
export type BannerTargetAudience = "admin" | "agent" | "super" | "player";

export interface EntryBanner {
  id: string;
  title: string;
  contentType: BannerContentType;
  textContent: string | null;
  imageUrl: string | null;
  imageSize: number | null; // size in bytes
  imageWidth: number | null;
  imageHeight: number | null;
  startDate: string | null; // ISO date string
  endDate: string | null; // ISO date string
  targetAudience: BannerTargetAudience[];
  requireConfirmation: boolean;
  confirmationText: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface EntryBannerFormData {
  title: string;
  contentType: BannerContentType;
  textContent: string;
  imageFile: File | null;
  startDate: string | null;
  endDate: string | null;
  targetAudience: BannerTargetAudience[];
  requireConfirmation: boolean;
  confirmationText: string;
}

export interface EntryBannerListResult {
  banners: EntryBanner[];
  totalCount: number;
}

