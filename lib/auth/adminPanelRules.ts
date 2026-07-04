export type AdminSubRole = "manager" | "finance" | "support" | "room" | "dev_panel";
export type UserRole = "player" | "admin" | "super" | "agent";

export function isDevPanelSubRole(
  adminSubRole: AdminSubRole | string | null | undefined
): boolean {
  return adminSubRole === "dev_panel";
}

export function canAccessAdminPanel(
  role: UserRole | string | undefined,
  adminSubRole: AdminSubRole | string | null | undefined
): boolean {
  return role === "admin" && !isDevPanelSubRole(adminSubRole);
}

export function canAccessDevPanel(
  role: UserRole | string | undefined,
  adminSubRole: AdminSubRole | string | null | undefined
): boolean {
  return role === "admin" && isDevPanelSubRole(adminSubRole);
}
