export function isAdminPanelPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isAdminPanelLocation(): boolean {
  if (typeof window === "undefined") return false;
  return isAdminPanelPath(window.location.pathname);
}
