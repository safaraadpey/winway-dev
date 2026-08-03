"use client";

import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

/**
 * صفحه ورود
 * از کامپوننت LoginForm استفاده می‌کند که سیستم username-based دارد
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

