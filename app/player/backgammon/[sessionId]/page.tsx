"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBackgammonSession } from "@/lib/backgammon/useBackgammonSession";
import BackgammonBoard from "@/components/backgammon/BackgammonBoard";
import DicePanel from "@/components/backgammon/DicePanel";
import WinnerOverlay from "@/components/backgammon/WinnerOverlay";
import styles from "../backgammon.module.css";

type Props = {
  params: { sessionId: string };
};

export default function BackgammonSessionPage({ params }: Props) {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const { snapshot, loading, error, roll, move, endTurn } = useBackgammonSession(
    params.sessionId
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/player/backgammon"));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setOnBackClick, setShowBackButton]);

  const wrap = async (fn: () => Promise<void>) => {
    try {
      setBusy(true);
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (loading && !snapshot) {
    return <div className={styles.loading}>Loading game…</div>;
  }

  if (error && !snapshot) {
    return <div className={styles.error}>{error}</div>;
  }

  if (!snapshot) {
    return <div className={styles.error}>Game not found.</div>;
  }

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.title}>تخته‌نرد</h1>
        <p className={styles.subtitle}>
          {snapshot.matchStatus === "waiting"
            ? "در انتظار حریف…"
            : snapshot.matchStatus === "finished"
              ? "بازی تمام شد"
              : "مهره‌های خود را بازی کنید"}
        </p>
      </div>

      <BackgammonBoard
        snapshot={snapshot}
        disabled={busy || snapshot.matchStatus !== "running"}
        onMove={(m) => wrap(() => move(m))}
      />

      <DicePanel
        snapshot={snapshot}
        busy={busy}
        onRoll={() => wrap(roll)}
        onEndTurn={() => wrap(endTurn)}
      />

      {error ? <div className={styles.error}>{error}</div> : null}

      <WinnerOverlay
        snapshot={snapshot}
        onClose={() => router.push("/player/backgammon")}
      />
    </div>
  );
}
