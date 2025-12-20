import loginBg from "@/src/assets/logo/login_BG.png";
import bg002 from "@/src/assets/logo/BG002.png";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import ingameLogo from "@/src/assets/logo/ingamelogo.png";
import Image from "next/image";

export type Winner = {
  id: string;
  avatarUrl: string;
  nickname: string;
  prizeAmount: number;
};

interface WinnerRowProps {
  winner: Winner;
}

function WinnerRow({ winner }: WinnerRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/60 border border-[rgba(101,79,150,1)] px-4 py-1 h-[39px] max-h-[40px]">
      <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full bg-[#1f2735] border border-[#3a4356]">
        {winner.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={winner.avatarUrl}
            alt={winner.nickname}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-lg font-semibold text-white">{winner.nickname?.[0] ?? "?"}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col text-white">
        <span className="text-base font-semibold">{winner.nickname}</span>
      </div>
      <div className="flex flex-col items-end">
        <div className="flex items-baseline gap-1">
          <span className="latin-number text-lg font-extrabold text-[#fbbf24]">
            {winner.prizeAmount.toLocaleString("en-US")}
          </span>
          <span className="text-sm font-semibold text-[#fbbf24]">تومان</span>
        </div>
      </div>
    </div>
  );
}

interface WinnersSectionProps {
  kind: "line" | "full";
  winners: Winner[];
}

function WinnersSection({ kind, winners }: WinnersSectionProps) {
  const title =
    kind === "line"
      ? winners.length === 1
        ? "برنده خطی"
        : "برندگان خطی"
      : winners.length === 1
        ? "برنده دبرنا"
        : "برندگان دبرنا";

  return (
    <div
      className="rounded-none px-4 py-4 space-y-3"
      style={{
        backgroundImage: `url(${bg002.src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center center",
        backgroundSize: "100% 100%",
        backgroundColor: "#1f2735",
      }}
    >
      <div className="flex items-center justify-center gap-2 text-base font-semibold">
        <span>🏆</span>
        <span
          style={{
            color: "rgba(254, 238, 180, 1)",
            textShadow: "0 1px 0 rgba(0, 0, 0, 0.6)",
          }}
        >
          {title}
        </span>
        <span>🏆</span>
      </div>
      {winners.length === 0 ? (
        <div className="rounded-2xl bg-[#242c3b] px-3 py-3 text-center text-sm text-gray-400">
          برنده‌ای ثبت نشده است
        </div>
      ) : (
        <div className="space-y-3">
          {winners.map((w, idx) => (
            <WinnerRow key={`${w.id}-${idx}`} winner={w} />
          ))}
        </div>
      )}
    </div>
  );
}

interface GameResultsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string | null;
  lineWinners: Winner[];
  fullWinners: Winner[];
  title?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
}

export default function GameResultsDialog({
  isOpen,
  onClose,
  currentUserId,
  lineWinners,
  fullWinners,
  title,
  primaryActionLabel,
  onPrimaryAction,
}: GameResultsDialogProps) {
  if (!isOpen) return null;

  const isWinner =
    (!!currentUserId &&
      (lineWinners.some((w) => w.id === currentUserId) ||
        fullWinners.some((w) => w.id === currentUserId))) ||
    false;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4">
      <div
        className="w-full max-w-md rounded-3xl p-5 shadow-2xl border border-[#1f2837] text-white space-y-4"
        style={{
          backgroundImage: `url(${loginBg.src})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center center",
          backgroundSize: "100% 100%",
          backgroundColor: "#0f1720",
        }}
      >
        <div className="flex flex-col items-center text-center space-y-2">
          {isWinner && (
            <div className="flex items-center gap-2 text-lg font-bold">
              <span
                style={{
                  color: "rgba(254, 238, 180, 1)",
                  textShadow: "0 1px 0 rgba(0, 0, 0, 0.6)",
                }}
              >
                🏆 تبریک 🏆
              </span>
            </div>
          )}
          {isWinner && (
            <Image
              src={ingameLogo}
              alt="ingame logo"
              width={220}
              height={100}
              style={{ height: 100, width: "auto" }}
              priority={false}
            />
          )}
          <div className="text-xl font-extrabold">{title ?? "بازی تمام شد!"}</div>
        </div>

        <div className="space-y-4">
          <WinnersSection kind="line" winners={lineWinners} />
          <WinnersSection kind="full" winners={fullWinners} />
        </div>

        <button
          type="button"
          onClick={onPrimaryAction ?? onClose}
          className="mt-2 w-full rounded-2xl py-3 text-center text-white font-bold shadow-lg active:opacity-90 transition"
          style={{
            backgroundImage: `url(${buyCardButtonBg.src})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center center",
            backgroundSize: "100% 100%",
          }}
        >
          {primaryActionLabel ?? "بازگشت به لیست اتاق‌ها"}
        </button>
      </div>
    </div>
  );
}
