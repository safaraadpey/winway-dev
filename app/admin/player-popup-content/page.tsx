"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import PlayerPopupContentDesignLab from "@/components/player-popup-content/PlayerPopupContentDesignLab";
import PlayerPopupFullPreviewOverlay from "@/components/player-popup-content/PlayerPopupFullPreviewOverlay";
import { createTournamentBreakSampleFeed } from "@/lib/player-popup-content/fixtures/tournament-break.sample";

export default function AdminPlayerPopupContentPage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } =
    useHeaderVisibility();
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewFeed = useMemo(
    () => createTournamentBreakSampleFeed({ breakMinutes: 12 }),
    []
  );

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/admin/dashboard"));

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setOnBackClick, setShowBackButton, setShowHeader]);

  return (
    <>
      <div className="min-h-screen bg-[#0E0E0F] text-white p-4 pb-10">
        <div className="max-w-md mx-auto space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Player Popup Content</h1>
            <p className="text-sm text-gray-400 leading-6">
              طراحی و پیش‌نمایش محتوای داینامیک popup پلیر. نمونه Tournament Break
              زیر shell مرجع کپی شده تا بتوانید layout را قبل از اتصال Admin/API
              بررسی کنید.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="w-full rounded-xl bg-teal-600 py-3 font-semibold hover:bg-teal-700"
          >
            مشاهده پیش‌نمایش
          </button>

          <PlayerPopupContentDesignLab />
        </div>
      </div>

      <PlayerPopupFullPreviewOverlay
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        popupContent={previewFeed}
      />
    </>
  );
}
