"use client";

import React, { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
    // در حال redirect است — برای جلوگیری از black flash، یک UI shell سبک رندر می‌کنیم.
    return (
      <div className="min-h-screen bg-black/40 text-white">
        <div className="px-4 pt-4 space-y-4">
          <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="h-5 w-44 rounded-md bg-white/10" />
            <div className="h-4 w-64 rounded-md bg-white/10" />
          </div>

          <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="h-4 w-40 rounded-md bg-white/10" />
            <div className="space-y-2">
              <div className="h-10 rounded-xl bg-white/10" />
              <div className="h-10 rounded-xl bg-white/10" />
              <div className="h-10 rounded-xl bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <GameRoomScreen roomId={roomId} templateId={templateId} />;
}


