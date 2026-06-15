"use client";

import React, { useEffect, useState } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  parseDrawVerificationJson,
  verifyDrawPayload,
  type DrawVerificationOutcome,
} from "@/lib/provablyFairVerify";

const STANDALONE_FAIRNESS_PATH = "/draw-fairness.html";
const STANDALONE_JSON_STORAGE_KEY = "winway_draw_fairness_json";

const EXAMPLE_PLACEHOLDER = `{
  "roomId": "...",
  "serverSeed": "...",
  "serverSeedHash": "...",
  "drawnNumbers": [12, 34, 7],
  "drawCount": 3
}`;

export default function DrawFairnessPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [jsonInput, setJsonInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<DrawVerificationOutcome | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      window.history.back();
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowBackButton, setOnBackClick]);

  const handleOpenStandalone = () => {
    try {
      if (jsonInput.trim()) {
        localStorage.setItem(STANDALONE_JSON_STORAGE_KEY, jsonInput);
      }
    } catch {
      // ignore storage errors
    }
    window.open(STANDALONE_FAIRNESS_PATH, "_blank", "noopener,noreferrer");
  };

  const handlePasteFromClipboard = async () => {
    setPasteError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteError("کلیپ‌بورد خالی است.");
        return;
      }
      setJsonInput(text);
    } catch {
      setPasteError("دسترسی به کلیپ‌بورد ممکن نیست.");
    }
  };

  const handleVerify = async () => {
    setOutcome(null);
    setParseError(null);

    const { input, error } = parseDrawVerificationJson(jsonInput);
    if (error || !input) {
      setParseError(error);
      return;
    }

    setLoading(true);
    try {
      const result = await verifyDrawPayload(input);
      setOutcome(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[#0E0E0F] px-4 pb-8 pt-2 text-white [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="mx-auto max-w-md space-y-5">
        <header className="text-center space-y-1">
          <h1 className="text-xl font-extrabold text-[#FEEEB4]">بررسی قرعه</h1>
          <p
            dir="rtl"
            className="text-right text-[13px] text-white/70 leading-relaxed"
          >
            برای دریافت اطلاعات provably fair در پایان بازی روی دکمه «کپی هش»
            بزنید و اطلاعات کپی‌شده را در کادر مشخصات قرعه در پایین صفحه
            الصاق کنید و دکمه محاسبه را بزنید.
          </p>
        </header>

        <section className="space-y-2">
          <label htmlFor="verify-json" className="text-sm font-semibold text-white/90">
            JSON مشخصات قرعه
          </label>
          <div className="overflow-hidden rounded-2xl border border-[#2a3a52] bg-black/50 focus-within:border-[#2a92b2]">
            <div
              dir="rtl"
              className="flex items-center justify-end border-b border-[#2a3a52] px-2 py-1.5"
            >
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/90 active:opacity-80"
              >
                الصاق از کلیپ بورد
              </button>
            </div>
            <textarea
              id="verify-json"
              dir="ltr"
              value={jsonInput}
              onChange={(e) => {
                setPasteError(null);
                setJsonInput(e.target.value);
              }}
              placeholder={EXAMPLE_PLACEHOLDER}
              rows={10}
              className="latin-number block w-full resize-y border-0 bg-transparent p-3 text-[12px] leading-relaxed text-white/90 outline-none"
            />
          </div>
          {pasteError && (
            <p className="text-right text-[12px] text-red-300">{pasteError}</p>
          )}
        </section>

        <button
          type="button"
          onClick={handleVerify}
          disabled={loading || !jsonInput.trim()}
          className="w-full rounded-2xl bg-[#2a92b2] py-3 text-center text-sm font-bold text-white shadow-lg active:opacity-90 disabled:opacity-50"
        >
          {loading ? "در حال محاسبه…" : "محاسبه"}
        </button>

        <p
          dir="rtl"
          className="text-right text-[13px] text-white/70 leading-relaxed"
        >
          برای اعتماد بیشتر می‌توانید محاسبه‌گر مستقل مرورگر را استفاده کنید
        </p>

        <button
          type="button"
          onClick={handleOpenStandalone}
          className="w-full rounded-2xl border border-white/20 bg-transparent py-3 text-center text-sm font-bold text-white/90 active:opacity-90"
        >
          بررسی مستقل در مرورگر
        </button>

        {parseError && (
          <div
            role="alert"
            className="rounded-2xl border border-red-400/50 bg-red-950/40 px-4 py-3 text-[13px] text-red-200"
          >
            {parseError}
          </div>
        )}

        {outcome && (
          <section
            className={`rounded-2xl border p-4 space-y-4 ${
              outcome.ok
                ? "border-emerald-400/50 bg-emerald-950/30"
                : "border-red-400/50 bg-red-950/30"
            }`}
          >
            <div className="text-center">
              <p
                className={`text-lg font-extrabold ${
                  outcome.ok ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {outcome.ok ? "✅ قرعه معتبر و provably fair" : "❌ تأیید ناموفق"}
              </p>
            </div>

            <ul className="space-y-2">
              {outcome.checks.map((check) => (
                <li
                  key={check.id}
                  className={`rounded-xl border px-3 py-2 text-[12px] ${
                    check.passed
                      ? "border-emerald-500/30 bg-emerald-900/20"
                      : "border-red-500/30 bg-red-900/20"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">
                      {check.passed ? "✓" : "✗"}
                    </span>
                    <div>
                      <p className="font-semibold text-white/90">{check.label}</p>
                      {check.detail && (
                        <p className="mt-1 text-white/65 leading-relaxed">
                          {check.detail}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {outcome.reproducedDraws.length > 0 && (
              <div className="space-y-1">
                <p className="text-[12px] font-semibold text-white/80">
                  اعداد بازتولید‌شده:
                </p>
                <p
                  dir="ltr"
                  className="latin-number rounded-xl border border-white/10 bg-black/40 p-2 text-[11px] leading-relaxed text-white/75 break-all"
                >
                  {outcome.reproducedDraws.join(", ")}
                </p>
              </div>
            )}
          </section>
        )}

        <section
          dir="rtl"
          className="rounded-2xl border border-[#1f2837] bg-black/40 p-4 space-y-3 text-right text-[13px] leading-relaxed text-white/85"
        >
          <h2 className="text-sm font-bold text-[#FEEEB4]">روش محاسبه</h2>
          <ol className="list-decimal list-outside mr-4 space-y-2 text-white/80">
            <li>
              قبل از بازی <span className="text-white/90">serverSeedHash</span>{" "}
              (کد commit) در میز نمایش داده و قابل کپی است.
            </li>
            <li>
              پس از بازی <span className="text-white/90">serverSeed</span>{" "}
              منتشر می‌شود. تأیید commit:
              <code dir="ltr" className="mx-1 block mt-1 rounded-lg bg-black/50 px-2 py-1 text-left text-[11px] latin-number text-emerald-200/90">
                sha256(bytes_from_hex(serverSeed)) = serverSeedHash
              </code>
            </li>
            <li>
              برای هر قرعه، بین اعداد ۱ تا ۹۰ که هنوز نیامده‌اند، کلید
              <code dir="ltr" className="mx-1 block mt-1 rounded-lg bg-black/50 px-2 py-1 text-left text-[11px] latin-number text-sky-200/90">
                sha256(utf8(hex(seed)+&apos;:&apos;+n))
              </code>
              محاسبه می‌شود و عددی که <strong>کمینه</strong> کلید را دارد
              انتخاب می‌شود.
            </li>
            <li>
              ترتیب بازتولید‌شده با{" "}
              <span className="text-white/90">drawnNumbers</span> مقایسه می‌شود.
            </li>
          </ol>
          <p className="text-[12px] text-amber-200/80 border-t border-white/10 pt-2">
            توجه: هش commit روی بایت‌های seed است، نه روی متن hex (
            <span dir="ltr" className="latin-number">
              sha256(utf8(serverSeed))
            </span>{" "}
            استفاده نمی‌شود).
          </p>
        </section>
      </div>
    </div>
  );
}
