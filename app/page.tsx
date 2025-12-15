"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * صفحه اصلی (root)
 * بررسی می‌کند که کاربر لاگین کرده یا نه
 * - اگر لاگین کرده: به /post-login هدایت می‌شود (برای role-based routing)
 * - اگر لاگین نکرده: به /login هدایت می‌شود
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          // کاربر لاگین نکرده است
          router.push("/login");
        } else {
          // کاربر لاگین کرده است، به post-login برای role-based routing
          router.push("/post-login");
        }
      } catch (error) {
        console.error("Error checking auth:", error);
        router.push("/login");
      }
    }

    checkAuth();
  }, [router]);

  // نمایش loading در حین بررسی
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        </div>
        <p className="text-gray-600">در حال بارگذاری...</p>
      </div>
    </div>
  );
}
