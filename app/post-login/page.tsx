"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUserRoleInfo } from "@/lib/auth-helpers";

const DEFAULT_MAIN_HOST = "dingmoney.org";
const DEFAULT_ADMIN_ORIGIN = "https://admin.dingmoney.org";

function getMainHost(): string {
  return (process.env.NEXT_PUBLIC_MAIN_HOST || DEFAULT_MAIN_HOST).toLowerCase();
}

function getAdminOrigin(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_ADMIN_ORIGIN;
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }
  return DEFAULT_ADMIN_ORIGIN;
}

function isMainHost(hostname: string): boolean {
  const mainHost = getMainHost();
  const normalized = hostname.toLowerCase();
  return normalized === mainHost || normalized === `www.${mainHost}`;
}

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
  const adminOrigin = getAdminOrigin();

  useEffect(() => {
    async function redirectBasedOnRole() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          // اگر کاربر پیدا نشد، به صفحه login برگردان
          // (route group ها در URL حساب نمی‌شوند، پس مسیر صحیح همان /login است)
          router.push("/login");
          return;
        }

        // 1) تلاش برای خواندن نقش از جدول users (منبع اصلی حقیقت)
        const roleInfo = await getCurrentUserRoleInfo();

        let userRole: string | undefined = roleInfo?.role;
        let adminSubRole: string | null =
          (roleInfo?.admin_sub_role as string | null) ?? null;

        // 2) اگر به هر دلیل جدول users در دسترس نبود، از user_metadata استفاده می‌کنیم
        if (!userRole && user.user_metadata?.role) {
          userRole = user.user_metadata.role as string;
        }

        // 3) اگر باز هم نقش مشخص نشد، به عنوان player در نظر می‌گیریم
        if (!userRole) {
          userRole = "player";
        }

        // بر اساس نقش، redirect انجام می‌شود
        switch (userRole) {
          case "admin":
            if (isMainHost(window.location.hostname)) {
              await supabase.auth.signOut();
              setAdminPortalRequired(true);
              return;
            }

            // هدایت بر اساس admin_sub_role
            if (adminSubRole) {
              switch (adminSubRole) {
                case "finance":
                  redirectToAdmin("/admin/dashboard"); // فعلاً داشبورد واحد
                  break;
                case "support":
                  redirectToAdmin("/admin/dashboard");
                  break;
                case "room":
                  redirectToAdmin("/admin/room-templates");
                  break;
                case "manager":
                default:
                  // مدیر کل یا بدون sub_role
                  redirectToAdmin("/admin/dashboard");
                  break;
              }
            } else {
              // ادمین بدون sub_role (مدیر کل)
              redirectToAdmin("/admin/dashboard");
            }
            break;
          case "super":
            // سوپر از این به بعد مثل ایجنت از پنل ایجنت استفاده می‌کند
            router.push("/agent/dashboard");
            break;
          case "agent":
            router.push("/agent/dashboard");
            break;
          case "player":
          default:
            // پیش‌فرض: همه به player/home می‌روند
            router.push("/player/home");
            break;
        }
      } catch (error) {
        console.error("Error in post-login redirect:", error);
        // در صورت خطا، به player/home هدایت می‌کنیم
        router.push("/player/home");
      }
    }

    redirectBasedOnRole();
  }, [router]);

  if (adminPortalRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 px-5">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-lg">
          <h1 className="mb-3 text-xl font-bold text-gray-900">ورود ادمین از این آدرس مجاز نیست</h1>
          <p className="mb-5 text-sm leading-6 text-gray-600">
            برای ورود به پنل ادمین، لطفا از آدرس ادمین یا اپلیکیشن ادمین استفاده کنید.
          </p>
          <a
            href={`${adminOrigin}/login`}
            className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
          >
            ورود به اپ ادمین
          </a>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            بازگشت به ورود پلیر
          </button>
        </div>
      </div>
    );
  }

  // نمایش loading در حین redirect
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

