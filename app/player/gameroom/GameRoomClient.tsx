"use client";

import React, { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PageLoading from "@/components/PageLoading";
import GameRoomScreen from "@/src/screens/GameRoomScreen";

export default function GameRoomClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = searchParams.get("roomId") ?? undefined;
  const templateId = searchParams.get("templateId") ?? undefined;

  // غیرفعال کردن اسکرول عمودی برای این صفحه
  useEffect(() => {
    // ذخیره حالت قبلی
    const originalOverflow = document.body.style.overflow;
    const originalOverflowY = document.body.style.overflowY;

    // غیرفعال کردن اسکرول
    document.body.style.overflow = "hidden";
    document.body.style.overflowY = "hidden";

    // برگرداندن حالت قبلی هنگام unmount
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overflowY = originalOverflowY;
    };
  }, []);

  // اگر نه roomId و نه templateId وجود نداشت، به لابی برگردان
  useEffect(() => {
    if (!roomId && !templateId) {
      router.push("/player/lobby");
    }
  }, [roomId, templateId, router]);

  if (!roomId && !templateId) {
    return <PageLoading />;
  }

  return <GameRoomScreen roomId={roomId} templateId={templateId} />;
}


