"use client";

import React, { useEffect, useState } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  parseDrawVerificationJson,
  verifyDrawPayload,
  type DrawVerificationOutcome,
} from "@/lib/provablyFairVerify";
import styles from "./DrawFairnessPage.module.css";

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
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>بررسی قرعه</h1>
          <p className={styles.intro}>
            برای دریافت اطلاعات provably fair در پایان بازی روی دکمه «کپی هش»
            بزنید و اطلاعات کپی‌شده را در کادر مشخصات قرعه در پایین صفحه
            الصاق کنید و دکمه محاسبه را بزنید.
          </p>
        </header>

        <section className={styles.section}>
          <label htmlFor="verify-json" className={styles.label}>
            JSON مشخصات قرعه
          </label>
          <div className={styles.textareaWrap}>
            <div className={styles.textareaToolbar}>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className={styles.pasteButton}
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
              className={`${styles.textarea} latin-number`}
            />
          </div>
          {pasteError && <p className={styles.pasteError}>{pasteError}</p>}
        </section>

        <button
          type="button"
          onClick={handleVerify}
          disabled={loading || !jsonInput.trim()}
          className={styles.primaryButton}
        >
          {loading ? "در حال محاسبه…" : "محاسبه"}
        </button>

        <p className={styles.hint}>
          برای اعتماد بیشتر می‌توانید محاسبه‌گر مستقل مرورگر را استفاده کنید
        </p>

        <button
          type="button"
          onClick={handleOpenStandalone}
          className={styles.secondaryButton}
        >
          بررسی مستقل در مرورگر
        </button>

        {parseError && (
          <div role="alert" className={styles.parseError}>
            {parseError}
          </div>
        )}

        {outcome && (
          <section
            className={`${styles.resultSection} ${
              outcome.ok ? styles.resultOk : styles.resultFail
            }`}
          >
            <div>
              <p
                className={`${styles.resultTitle} ${
                  outcome.ok ? styles.resultTitleOk : styles.resultTitleFail
                }`}
              >
                {outcome.ok ? "✅ قرعه معتبر و provably fair" : "❌ تأیید ناموفق"}
              </p>
            </div>

            <ul className={styles.checkList}>
              {outcome.checks.map((check) => (
                <li
                  key={check.id}
                  className={`${styles.checkItem} ${
                    check.passed ? styles.checkItemOk : styles.checkItemFail
                  }`}
                >
                  <div className={styles.checkRow}>
                    <span className={styles.checkMark}>
                      {check.passed ? "✓" : "✗"}
                    </span>
                    <div>
                      <p className={styles.checkLabel}>{check.label}</p>
                      {check.detail && (
                        <p className={styles.checkDetail}>{check.detail}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {outcome.reproducedDraws.length > 0 && (
              <div className={styles.reproducedBlock}>
                <p className={styles.reproducedLabel}>اعداد بازتولید‌شده:</p>
                <p className={`${styles.reproducedValue} latin-number`}>
                  {outcome.reproducedDraws.join(", ")}
                </p>
              </div>
            )}
          </section>
        )}

        <section className={styles.infoSection}>
          <h2 className={styles.infoTitle}>روش محاسبه</h2>
          <ol className={styles.infoList}>
            <li>
              قبل از بازی{" "}
              <span className={styles.infoHighlight}>serverSeedHash</span> (کد
              commit) در میز نمایش داده و قابل کپی است.
            </li>
            <li>
              پس از بازی{" "}
              <span className={styles.infoHighlight}>serverSeed</span> منتشر
              می‌شود. تأیید commit:
              <code
                dir="ltr"
                className={`${styles.codeBlock} ${styles.codeBlockGreen} latin-number`}
              >
                sha256(bytes_from_hex(serverSeed)) = serverSeedHash
              </code>
            </li>
            <li>
              برای هر قرعه، بین اعداد ۱ تا ۹۰ که هنوز نیامده‌اند، کلید
              <code
                dir="ltr"
                className={`${styles.codeBlock} ${styles.codeBlockBlue} latin-number`}
              >
                sha256(utf8(hex(seed)+&apos;:&apos;+n))
              </code>
              محاسبه می‌شود و عددی که <strong>کمینه</strong> کلید را دارد
              انتخاب می‌شود.
            </li>
            <li>
              ترتیب بازتولید‌شده با{" "}
              <span className={styles.infoHighlight}>drawnNumbers</span> مقایسه
              می‌شود.
            </li>
          </ol>
          <p className={styles.warning}>
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
