"use client";

import { useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import AdminKycReviewPage from "@/components/admin/AdminKycReviewPage";

export default function AdminKycPage() {
  const { setShowHeader, setShowBackButton, setOnBackClick } =
    useHeaderVisibility();

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => history.back());

    return () => {
      setShowHeader(false);
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick]);

  return <AdminKycReviewPage />;
}
