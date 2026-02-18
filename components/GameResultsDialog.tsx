import loginBg from "@/src/assets/logo/login_BG.png";
import bg002 from "@/src/assets/logo/BG002.png";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import ingameLogo from "@/src/assets/logo/ingamelogo.png";
import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";

export type Winner = {
  id: string;
  avatarUrl: string;
  nickname: string;
  prizeAmount: number;
};

interface WinnerRowProps {
  winner: Winner;
  showPrize: boolean;
}

function WinnerRow({ winner, showPrize }: WinnerRowProps) {
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
      {showPrize && (
        <div className="flex flex-col items-end">
          <div className="flex items-baseline gap-1">
            <span className="latin-number text-lg font-extrabold text-[#fbbf24]">
              {winner.prizeAmount.toLocaleString("en-US")}
            </span>
            <span className="text-sm font-semibold text-[#fbbf24]">تومان</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface WinnersSectionProps {
  kind: "line" | "full";
  winners: Winner[];
  showPrize: boolean;
}

function WinnersSection({ kind, winners, showPrize }: WinnersSectionProps) {
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
            <WinnerRow key={`${w.id}-${idx}`} winner={w} showPrize={showPrize} />
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
  isTournament?: boolean;
  title?: React.ReactNode;
  proofSeed?: string | null;
  proofCommitHash?: string | null;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
}

export default function GameResultsDialog({
  isOpen,
  onClose,
  currentUserId,
  lineWinners,
  fullWinners,
  isTournament = false,
  title,
  proofSeed,
  proofCommitHash,
  primaryActionLabel,
  onPrimaryAction,
}: GameResultsDialogProps) {
  if (!isOpen) return null;

  const [copyToast, setCopyToast] = useState<null | "success" | "error">(null);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isWinner =
    (!!currentUserId &&
      (lineWinners.some((w) => w.id === currentUserId) ||
        fullWinners.some((w) => w.id === currentUserId))) ||
    false;
  const effectivePrimaryActionLabel =
    primaryActionLabel ?? (isTournament ? "بازگشت به لابی تورنومنت" : "بازگشت به لیست اتاق‌ها");

  const seedRaw = proofSeed ? String(proofSeed) : null;
  const seedHex = seedRaw
    ? seedRaw.startsWith("\\x")
      ? seedRaw.slice(2)
      : seedRaw
    : null;

  const commitRaw = proofCommitHash ? String(proofCommitHash) : null;

  const proofFull =
    seedHex && commitRaw
      ? `${seedHex}|${commitRaw}`
      : commitRaw
        ? commitRaw
        : null;

  const proofDisplay =
    seedHex && commitRaw
      ? `${seedHex.slice(0, 6)}...${seedHex.slice(-6)}|${commitRaw.slice(0, 4)}...${commitRaw.slice(-4)}`
      : commitRaw
        ? `${commitRaw.slice(0, 6)}...${commitRaw.slice(-6)}`
        : null;

  const copyProof = async () => {
    if (!proofFull) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(proofFull);
      copied = true;
    } catch {
      // fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = proofFull;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        copied = true;
      } catch {
        // ignore
      }
    }
    setCopyToast(copied ? "success" : "error");
    if (copyToastTimerRef.current) {
      clearTimeout(copyToastTimerRef.current);
      copyToastTimerRef.current = null;
    }
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToast(null);
      copyToastTimerRef.current = null;
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        clearTimeout(copyToastTimerRef.current);
        copyToastTimerRef.current = null;
      }
    };
  }, []);

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
          <Image
            src={ingameLogo}
            alt="ingame logo"
            width={220}
            height={100}
            style={{ height: 100, width: "auto" }}
            priority={false}
          />
          <div
            className="text-[14px] font-extrabold max-w-full truncate"
            style={{
              unicodeBidi: "plaintext",
              color: "rgba(254, 238, 180, 1)",
              textShadow: "0 1px 0 rgba(0, 0, 0, 0.6)",
            }}
          >
            {title ?? "بازی تمام شد!"}
          </div>

          {proofDisplay && (
            <div className="relative w-full flex items-center justify-center gap-2 text-[12px]">
              {copyToast && (
                <span
                  role="status"
                  aria-live="polite"
                  className={`pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border px-2 py-1 text-[12px] shadow-lg ${
                    copyToast === "success"
                      ? "border-emerald-300 bg-emerald-600 text-white"
                      : "border-red-300 bg-red-600 text-white"
                  }`}
                >
                  {copyToast === "success" ? "کپی شد" : "خطا در کپی"}
                </span>
              )}
              <span className="text-white/70">seed|commit</span>
              <span dir="ltr" className="latin-number text-white/90">
                {proofDisplay}
              </span>
              <button
                type="button"
                onClick={copyProof}
                className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-white/90 active:opacity-80"
              >
                کپی هش
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!isTournament && <WinnersSection kind="line" winners={lineWinners} showPrize />}
          <WinnersSection kind="full" winners={fullWinners} showPrize={!isTournament} />
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
          {effectivePrimaryActionLabel}
        </button>
      </div>
    </div>
  );
}
