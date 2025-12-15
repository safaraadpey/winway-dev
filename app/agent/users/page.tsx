"use client";

import { useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import ManagedUsersList from "@/components/admin/ManagedUsersList";

export default function AgentUsersPage() {
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

  return <ManagedUsersList pageTitle="مدیریت کاربران" />;
}

