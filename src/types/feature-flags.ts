export type FeatureRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  default_enabled: boolean;
  rollout_percentage: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  enabledOverrideCount: number;
  assignedUserCount: number;
};

export type FeatureUserOverrideRow = {
  userId: string;
  username: string;
  nickname: string | null;
  displayName: string;
  missing: boolean;
  isEnabled: boolean;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeatureUserSearchRow = {
  id: string;
  username: string;
  nickname: string | null;
  displayName: string;
  role: string;
  status: string;
};

export type PlayerFeaturesSnapshot = {
  features: string[];
  evaluatedAt: string;
};
