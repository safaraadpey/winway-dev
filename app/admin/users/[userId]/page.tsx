"use client";

import UserAccountPage from "@/components/admin/UserAccountPage";

export default function AdminUserAccountPage({
  params,
}: {
  params: { userId: string };
}) {
  return <UserAccountPage userId={params.userId} />;
}


