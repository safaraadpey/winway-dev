"use client";

import { useParams } from "next/navigation";
import UserAccountPage from "@/components/admin/UserAccountPage";

export default function AdminUserAccountPage() {
  const params = useParams();
  const userId = params?.userId as string;
  
  if (!userId) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center py-8 text-gray-400">کاربر یافت نشد</div>
        </div>
      </div>
    );
  }
  
  return <UserAccountPage userId={userId} />;
}

