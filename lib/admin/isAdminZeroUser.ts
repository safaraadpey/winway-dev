/** Client-safe adminzero check — no server imports. */

export function isAdminZeroUser(
  user:
    | {
        role?: string | null;
        username?: string | null;
        admin_sub_role?: string | null;
        adminSubRole?: string | null;
      }
    | null
    | undefined
): boolean {
  const subRole = user?.admin_sub_role ?? user?.adminSubRole ?? null;
  return (
    user?.role === "admin" &&
    user?.username === "adminzero" &&
    (subRole === null || subRole === undefined)
  );
}
