"use client";

import React, { useEffect, useState } from "react";
import BingoCardDemo from "@/components/BingoCardDemo";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";
import styles from "./CardLookupPage.module.css";

type CardGrid = (number | null)[][];

type LookupSuccess = {
  ok: true;
  cardNo: number;
  card: CardGrid;
  pool: { poolId: string; cardCount: number };
};

type LookupError = {
  ok: false;
  error?: string;
  message?: string;
};

function toAsciiDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - "۰".charCodeAt(0)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - "٠".charCodeAt(0)));
}

function sanitizeCardNoInput(raw: string): string {
  return toAsciiDigits(raw).replace(/\D/g, "").slice(0, 5);
}

export default function CardLookupPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [cardNoInput, setCardNoInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupSuccess | null>(null);

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    const cardNo = Number(sanitizeCardNoInput(cardNoInput));
    if (!Number.isInteger(cardNo) || cardNo < 1) {
      setError("شماره کارت را وارد کنید.");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      if (!token) {
        setError("برای مشاهده کارت باید وارد حساب شوید.");
        return;
      }

      const res = await fetch(
        `/api/player/card-pool/lookup?cardNo=${encodeURIComponent(String(cardNo))}`,
        {
          method: "GET",
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const body = (await res.json()) as LookupSuccess | LookupError;
      if (!res.ok || !body.ok) {
        const fail = body as LookupError;
        setError(fail.message || "کارتی با این شماره پیدا نشد.");
        return;
      }

      setResult(body);
    } catch {
      setError("ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>مشاهده کارتها</h1>
          <p className={styles.intro}>
            شماره کارت را وارد کنید تا همان کارت از استخر فعال نمایش داده شود.
          </p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <section className={styles.section}>
            <label htmlFor="card-no-input" className={styles.label}>
              شماره کارت
            </label>
            <div className={styles.inputWrap}>
              <input
                id="card-no-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                dir="ltr"
                value={cardNoInput}
                onChange={(e) => {
                  setError(null);
                  setCardNoInput(sanitizeCardNoInput(e.target.value));
                }}
                placeholder="مثلاً 12"
                className={`${styles.input} numeric-text numeric-text--18`}
              />
            </div>
          </section>

          <button
            type="submit"
            disabled={loading || !cardNoInput}
            className={styles.primaryButton}
          >
            {loading ? "در حال نمایش…" : "نمایش"}
          </button>
        </form>

        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}

        {result && (
          <div className={styles.cardPreview}>
            <BingoCardDemo
              cardData={result.card}
              cardNumber={result.cardNo}
              playerName=""
              size="large"
              isMyCard
              linePrize={false}
              calledNumbers={[]}
            />
          </div>
        )}

        {result?.pool.cardCount ? (
          <p className={styles.hint}>
            استخر فعال شامل{" "}
            <span className="numeric-text numeric-text--14" dir="ltr">
              {result.pool.cardCount.toLocaleString("en-US")}
            </span>{" "}
            کارت است.
          </p>
        ) : null}
      </div>
    </div>
  );
}
