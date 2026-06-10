export interface DevPlayWindow {
  start: string;
  end: string;
}

export interface DevPlayerConfig {
  userId: string;
  isEnabled: boolean;
  playWindows: DevPlayWindow[];
  minRoomPrice: number | null;
  maxRoomPrice: number | null;
  maxTicketCount: number;
  updatedAt: string | null;
}

export interface DevPanelUserRow {
  id: string;
  shortId: string;
  username: string;
  nickname: string | null;
  displayName: string;
  role: "player" | "agent" | "super" | "admin";
  status: "active" | "suspended" | "deleted";
  agentName: string | null;
  superName: string | null;
  devPlayerConfig: DevPlayerConfig | null;
}

export interface DevPanelUsersListResult {
  users: DevPanelUserRow[];
  totalCount: number;
}

export const DEFAULT_DEV_PLAYER_CONFIG: Omit<DevPlayerConfig, "userId" | "updatedAt"> = {
  isEnabled: true,
  playWindows: [{ start: "10:00", end: "22:00" }],
  minRoomPrice: null,
  maxRoomPrice: null,
  maxTicketCount: 2,
};
