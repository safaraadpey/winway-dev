export function isAgentPanelPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/agent" || pathname.startsWith("/agent/");
}

export function isAgentPanelLocation(): boolean {
  if (typeof window === "undefined") return false;
  return isAgentPanelPath(window.location.pathname);
}
