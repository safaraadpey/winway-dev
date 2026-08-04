"use client";

import { useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import CryptoPaymentManager from "@/components/admin/CryptoPaymentManager";

export default function AdminCryptoPaymentPage() {
  const { setShowHeader, setShowBackButton, setOnBackClick } =
    useHeaderVisibility();

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => history.back());

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick]);

  return <CryptoPaymentManager />;
}
