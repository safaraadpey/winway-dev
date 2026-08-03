"use client";

import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
