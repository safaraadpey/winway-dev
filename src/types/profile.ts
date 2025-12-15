// src/types/profile.ts
//
// Types for user profile management

export interface ProfileInfo {
  userId: string;
  username: string;
  displayName: string; // از user_profiles.nickname یا users.username
  avatarUrl: string | null; // از user_profiles.avatar_url (برای آواتارهای آپلود شده)
  avatarId: string | null; // از user_profiles.metadata.avatar_id (برای آواتارهای داخلی)
  email: string;
}

export interface ProfileUpdateData {
  displayName?: string;
  avatarUrl?: string | null;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

