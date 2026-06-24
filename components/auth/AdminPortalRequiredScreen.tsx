"use client";

import { getAdminHost, getAdminOrigin } from "@/lib/auth/portalHosts";

type AdminPortalRequiredScreenProps = {
  onBackToLogin?: () => void;
};

export default function AdminPortalRequiredScreen({
  onBackToLogin,
}: AdminPortalRequiredScreenProps) {
  const adminHost = getAdminHost();
  const adminOrigin = getAdminOrigin();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-5">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-lg">
        <h1 className="mb-3 text-xl font-bold text-gray-900">
          ورود به داشبورد مدیریت
        </h1>
        <p className="mb-5 text-sm leading-6 text-gray-600">
          حساب شما با نقش مدیریتی ثبت شده است. برای ورود به داشبورد مدیریت،
          لطفاً از دامنه{" "}
          <span className="font-semibold text-gray-900">{adminHost}</span>{" "}
          استفاده کنید.
        </p>
        <a
          href={`${adminOrigin}/login`}
          className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
        >
          ورود به داشبورد مدیریت
        </a>
        {onBackToLogin ? (
          <button
            type="button"
            onClick={onBackToLogin}
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700"
          >
            بازگشت به ورود پلیر
          </button>
        ) : null}
      </div>
    </div>
  );
}
