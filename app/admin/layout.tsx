import { headers } from "next/headers";
import { requireAdminPanelAccess } from "@/lib/auth/requireAdminPanelAccess";
import AdminLayoutClient from "./AdminLayoutClient";

/**
 * Layout برای بخش ادمین
 * Server gate runs before render; client guards remain as defense-in-depth.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = headers().get("x-pathname") ?? "";
  const isLoginPage = pathname === "/admin/login";

  if (!isLoginPage) {
    await requireAdminPanelAccess();
  }

  return <AdminLayoutClient isLoginPage={isLoginPage}>{children}</AdminLayoutClient>;
}
