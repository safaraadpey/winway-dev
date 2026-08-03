"use client";

import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export default function DevPanelLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
