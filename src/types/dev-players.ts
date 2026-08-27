export interface DevPlayerConfig {
  userId: string;
  isEnabled: boolean;
  updatedAt: string | null;
}

export interface DevPlayWindow {
  start: string;
  end: string;
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
