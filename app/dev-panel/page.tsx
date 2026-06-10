"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DevPanelRootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dev-panel/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0E0E0F]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-300 border-r-transparent" />
    </div>
  );
}
