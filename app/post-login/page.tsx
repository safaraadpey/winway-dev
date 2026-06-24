"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUserRoleInfo } from "@/lib/auth-helpers";
import AdminPortalRequiredScreen from "@/components/auth/AdminPortalRequiredScreen";
import {
  getAdminOrigin,
  getMainOrigin,
  isAdminHost,
  isMainHost,
  isNonPlayerRole,
} from "@/lib/auth/portalHosts";
import { signOutInBackground } from "@/lib/auth/signOutInBackground";

function redirectToAdmin(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  window.location.assign(`${getAdminOrigin()}${normalizedPath}`);
}

/**
 * صفحه میانی برای تصمیم‌گیری بر اساس نقش کاربر
 * بعد از لاگین موفق، کاربر به این صفحه هدایت می‌شود
 * و سپس بر اساس نقش خود به مسیر مناسب redirect می‌شود
 */
export default function PostLoginPage() {
  const router = useRouter();
  const [adminPortalRequired, setAdminPortalRequired] = useState(false);
  const [playerPortalRequired, setPlayerPortalRequired] = useState(false);
  const mainOrigin = getMainOrigin();

  useEffect(() => {
    async function redirectBasedOnRole() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/login");
          return;
        }

        const roleInfo = await getCurrentUserRoleInfo();

        let userRole: string | undefined = roleInfo?.role;
        let adminSubRole: string | null =
          (roleInfo?.admin_sub_role as string | null) ?? null;

        if (!userRole && user.user_metadata?.role) {
          userRole = user.user_metadata.role as string;
        }

        if (!userRole) {
          userRole = "player";
        }

        const hostname = window.location.hostname;
        const onMainHost = isMainHost(hostname);
        const onAdminHost = isAdminHost(hostname);

        if (onMainHost && isNonPlayerRole(userRole)) {
          setAdminPortalRequired(true);
          signOutInBackground();
          return;
        }

        if (onAdminHost && userRole === "player") {
          setPlayerPortalRequired(true);
          signOutInBackground();
          return;
        }

        switch (userRole) {
          case "admin":
            if (adminSubRole) {
              switch (adminSubRole) {
                case "finance":
                  redirectToAdmin("/admin/dashboard");
                  break;
                case "support":
                  redirectToAdmin("/admin/dashboard");
                  break;
                case "room":
                  redirectToAdmin("/admin/room-templates");
                  break;
                case "dev_panel":
                  redirectToAdmin("/dev-panel/dashboard");
                  break;
                case "manager":
                default:
                  redirectToAdmin("/admin/dashboard");
                  break;
              }
            } else {
              redirectToAdmin("/admin/dashboard");
            }
            break;
          case "super":
          case "agent":
            router.push("/agent/dashboard");
            break;
          case "player":
          default:
            router.push("/player/home");
            break;
        }
      } catch (error) {
        console.error("Error in post-login redirect:", error);
        router.push("/player/home");
      }
    }

    redirectBasedOnRole();
  }, [router]);

  if (adminPortalRequired) {
    return (
      <AdminPortalRequiredScreen onBackToLogin={() => router.replace("/login")} />
    );
  }

  if (playerPortalRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 px-5">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-lg">
          <h1 className="mb-3 text-xl font-bold text-gray-900">
            ورود پلیر از این آدرس مجاز نیست
          </h1>
          <p className="mb-5 text-sm leading-6 text-gray-600">
            برای ورود به پنل پلیر، لطفا از آدرس اصلی dingmoney.org یا اپلیکیشن
            پلیر استفاده کنید.
          </p>
          <a
            href={`${mainOrigin}/login`}
            className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
          >
            ورود به اپ پلیر
          </a>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            بازگشت به ورود
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        </div>
        <p className="text-gray-600">در حال هدایت...</p>
      </div>
    </div>
  );
}
