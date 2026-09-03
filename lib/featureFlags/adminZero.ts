import { supabaseServer } from "@/lib/supabaseServer";
import { isAdminZeroUser } from "@/lib/admin/isAdminZeroUser";

export { isAdminZeroUser };

export type AdminZeroUser = {
  id: string;
  username: string;
  role: string;
  admin_sub_role: string | null;
};

export async function verifyAdminZeroAccess(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseServer
      .from("users")
      .select("id, username, role, admin_sub_role")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    return isAdminZeroUser(data);
  } catch (err) {
    console.error("[Feature] verifyAdminZeroAccess error:", err);
    return false;
  }
}

export async function getAdminZeroUserOrNull(): Promise<AdminZeroUser | null> {
  const { data, error } = await supabaseServer
    .from("users")
    .select("id, username, role, admin_sub_role")
    .eq("username", "adminzero")
    .eq("role", "admin")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as AdminZeroUser;
}
