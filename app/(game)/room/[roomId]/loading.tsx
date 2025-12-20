import activeCardsBg from "@/src/assets/logo/ActiveCardsBG.png";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import ticktBuyBg from "@/src/assets/logo/TicktBuy_BG.png";

function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-md bg-white/10 ${className}`}
      aria-hidden="true"
    />
  );
}

function BuyCardsPanelSkeleton() {
  return (
    <div
      className="border border-transparent rounded-2xl p-3 space-y-4"
      style={{
        backgroundImage: `url(${ticktBuyBg.src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "100% 100%",
        backgroundColor: "#151A26",
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex flex-col items-center rounded-full border border-gray-600 px-3 py-1 text-white">
          <Skeleton className="h-3 w-16 rounded-full" />
          <Skeleton className="mt-2 h-6 w-10 rounded-full" />
        </div>

        <div className="bg-[#111111]/60 rounded-full px-2 py-2 flex items-center justify-center gap-4 border border-gray-600">
          <button
            disabled
            aria-label="کاهش"
            className="w-12 h-12 rounded-full bg-white/5 p-0 flex items-center justify-center shadow-lg opacity-60 cursor-not-allowed"
          >
            <Skeleton className="h-5 w-5 rounded-full bg-white/20" />
          </button>

          <Skeleton className="h-8 w-14 rounded-lg" />

          <button
            disabled
            aria-label="افزایش"
            className="w-12 h-12 rounded-full bg-white/5 p-0 flex items-center justify-center shadow-lg opacity-60 cursor-not-allowed"
          >
            <Skeleton className="h-5 w-5 rounded-full bg-white/20" />
          </button>
        </div>
      </div>

      <button
        disabled
        className="w-full py-4 rounded-xl bg-transparent text-[#006400] font-bold text-lg shadow-lg opacity-60 cursor-not-allowed"
        style={{
          backgroundImage: `url(${buyCardButtonBg.src})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "100% 100%",
        }}
      >
        <span className="flex items-center justify-center gap-2">
          <Skeleton className="h-5 w-5 rounded-full bg-white/20" />
          <Skeleton className="h-5 w-40 rounded-md bg-white/15" />
        </span>
      </button>
    </div>
  );
}

function ActiveCardsStatusSkeleton() {
  return (
    <div
      className="space-y-3 border border-transparent rounded-2xl px-3 pt-5 pb-5 mt-3 h-[200px] min-h-[200px] flex flex-col"
      style={{
        backgroundImage: `url(${activeCardsBg.src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "100% 100%",
        backgroundColor: "#161A26",
      }}
    >
      <div className="flex items-center justify-between h-[39px] max-h-[40px]">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-6 w-6 rounded-full bg-white/15" />
        </div>

        <Skeleton className="h-4 w-28 rounded-md" />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 flex items-center justify-between"
          >
            <Skeleton className="h-4 w-36 bg-white/10" />
            <Skeleton className="h-4 w-16 bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiveTablesSectionSkeleton() {
  return (
    <div
      className="space-y-3 border border-transparent rounded-lg px-3 pt-[4px] pb-[6px] mt-[9px] min-h-[200px]"
      style={{
        backgroundImage: `url(${activeCardsBg.src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "100% 100%",
        backgroundColor: "#171A26",
      }}
    >
      {/* title skeleton (no real text during loading) */}
      <div className="pt-2">
        <Skeleton className="h-4 w-28 mx-auto bg-white/10" />
      </div>

      <div
        className="space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ maxHeight: "146px" }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 flex items-center justify-between"
          >
            <Skeleton className="h-4 w-20 bg-white/10" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-14 bg-white/10" />
              <Skeleton className="h-4 w-14 bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Route segment loading UI for `/room/[roomId]` (this route lives under `app/(game)/...`).
 * Intentionally *visual-only*: no fetching, no routing, no business logic.
 */
export default function Loading() {
  return (
    <div className="overflow-hidden bg-[#0E0E0F] min-h-screen">
      <div className="px-4 space-y-1 pt-2">
        <BuyCardsPanelSkeleton />
        <ActiveCardsStatusSkeleton />
        <ActiveTablesSectionSkeleton />
      </div>
    </div>
  );
}


