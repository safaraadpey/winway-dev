export interface DevPlayerPlayWindow {
  start: string;
  end: string;
}

export interface DevPlayerProfileMember {
  userId: string;
  username: string;
  nickname: string | null;
  displayName: string;
}

export interface DevPlayerProfile {
  id: string;
  name: string;
  playWindows: DevPlayerPlayWindow[];
  allowedPrices: number[];
  memberCount: number;
  engineEnabled: boolean;
  members?: DevPlayerProfileMember[];
  updatedAt: string | null;
}

export interface DevPlayerProfileOperator {
  id: string;
  username: string;
  nickname: string | null;
  displayName: string;
  role: "super" | "agent";
}

export interface DevPlayerProfilePlayerOption {
  userId: string;
  username: string;
  nickname: string | null;
  displayName: string;
  isAssigned: boolean;
}

export interface SaveDevPlayerProfilePayload {
  id?: string;
  name: string;
  play_windows: DevPlayerPlayWindow[];
  allowed_prices: number[];
  member_user_ids: string[];
}
