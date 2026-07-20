"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { TourConfig, TourPlacement } from "@/lib/tour/types";
import styles from "./TourOverlay.module.css";

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

type TooltipPosition = {
  top: number;
  left: number;
};

type TourOverlayProps = {
  tour: TourConfig;
  stepIndex: number;
  onNext: () => Promise<void>;
  onPrevious: () => Promise<void>;
  onSkip: () => Promise<void>;
  onClose: () => Promise<void>;
  onCustomAction: () => Promise<void>;
  onTargetMissing: () => Promise<void>;
};

const TARGET_PADDING = 6;
const EDGE_GAP = 12;
const TOOLTIP_GAP = 12;
const TARGET_WAIT_MS = 5000;

function targetSelector(target: string) {
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(target)
      : target.replace(/["\\]/g, "\\$&");
  return `[data-tour-id="${escaped}"]`;
}

function getTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(targetSelector(target));
}

function waitForTarget(
  target: string,
  isCancelled: () => boolean
): Promise<HTMLElement | null> {
  const existing = getTarget(target);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (element: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeoutId);
      resolve(element);
    };
    const observer = new MutationObserver(() => {
      if (isCancelled()) {
        finish(null);
        return;
      }
      const element = getTarget(target);
      if (element) finish(element);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeoutId = window.setTimeout(() => finish(null), TARGET_WAIT_MS);
  });
}

function isOutsideViewport(rect: DOMRect) {
  return (
    rect.top < EDGE_GAP ||
    rect.left < EDGE_GAP ||
    rect.bottom > window.innerHeight - EDGE_GAP ||
    rect.right > window.innerWidth - EDGE_GAP
  );
}

function toHighlightRect(rect: DOMRect): HighlightRect {
  const top = Math.max(0, rect.top - TARGET_PADDING);
  const left = Math.max(0, rect.left - TARGET_PADDING);
  const right = Math.min(window.innerWidth, rect.right + TARGET_PADDING);
  const bottom = Math.min(window.innerHeight, rect.bottom + TARGET_PADDING);
  return {
    top,
    left,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function resolvePlacement(
  preferred: TourPlacement,
  rect: HighlightRect,
  tooltipWidth: number,
  tooltipHeight: number
): Exclude<TourPlacement, "auto"> {
  const available = {
    top: rect.top - TOOLTIP_GAP - EDGE_GAP,
    right: window.innerWidth - rect.right - TOOLTIP_GAP - EDGE_GAP,
    bottom: window.innerHeight - rect.bottom - TOOLTIP_GAP - EDGE_GAP,
    left: rect.left - TOOLTIP_GAP - EDGE_GAP,
  };
  const fits = {
    top: available.top >= tooltipHeight,
    right: available.right >= tooltipWidth,
    bottom: available.bottom >= tooltipHeight,
    left: available.left >= tooltipWidth,
  };

  if (preferred !== "auto" && fits[preferred]) return preferred;
  if (fits.bottom) return "bottom";
  if (fits.top) return "top";
  if (fits.right) return "right";
  if (fits.left) return "left";
  return available.bottom >= available.top ? "bottom" : "top";
}

function getTooltipPosition(
  placement: TourPlacement,
  rect: HighlightRect,
  tooltip: HTMLElement
): TooltipPosition {
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  const resolved = resolvePlacement(
    placement,
    rect,
    tooltipWidth,
    tooltipHeight
  );
  let top = rect.bottom + TOOLTIP_GAP;
  let left = rect.left + rect.width / 2 - tooltipWidth / 2;

  if (resolved === "top") {
    top = rect.top - tooltipHeight - TOOLTIP_GAP;
  } else if (resolved === "left") {
    top = rect.top + rect.height / 2 - tooltipHeight / 2;
    left = rect.left - tooltipWidth - TOOLTIP_GAP;
  } else if (resolved === "right") {
    top = rect.top + rect.height / 2 - tooltipHeight / 2;
    left = rect.right + TOOLTIP_GAP;
  }

  return {
    top: Math.max(
      EDGE_GAP,
      Math.min(top, window.innerHeight - tooltipHeight - EDGE_GAP)
    ),
    left: Math.max(
      EDGE_GAP,
      Math.min(left, window.innerWidth - tooltipWidth - EDGE_GAP)
    ),
  };
}

export function TourOverlay({
  tour,
  stepIndex,
  onNext,
  onPrevious,
  onSkip,
  onClose,
  onCustomAction,
  onTargetMissing,
}: TourOverlayProps) {
  const step = tour.steps[stepIndex];
  const primaryCustomAction =
    step?.customAction?.asPrimary === true ? step.customAction : null;
  const [mounted, setMounted] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<HighlightRect | null>(null);
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    setTarget(null);
    setRect(null);
    setTooltipPosition(null);

    const prepareTarget = async () => {
      const element = step.optional
        ? getTarget(step.target)
        : await waitForTarget(step.target, () => cancelled);
      if (cancelled) return;
      if (!element) {
        void onTargetMissing();
        return;
      }

      const initialRect = element.getBoundingClientRect();
      if (isOutsideViewport(initialRect)) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
        await new Promise((resolve) => window.setTimeout(resolve, 450));
      }
      if (!cancelled) setTarget(element);
    };

    void prepareTarget();
    return () => {
      cancelled = true;
    };
  }, [onTargetMissing, step.id, step.target]);

  const measure = useCallback(() => {
    if (!target || !target.isConnected) return;
    const nextRect = toHighlightRect(target.getBoundingClientRect());
    setRect(nextRect);
    if (tooltipRef.current) {
      setTooltipPosition(
        getTooltipPosition(
          step.placement ?? "auto",
          nextRect,
          tooltipRef.current
        )
      );
    }
  }, [step.placement, target]);

  useLayoutEffect(() => {
    if (!target) return;
    let animationFrame = window.requestAnimationFrame(measure);
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measure);
    };
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(target);
    if (tooltipRef.current) resizeObserver.observe(tooltipRef.current);

    const mutationObserver = new MutationObserver(() => {
      const current = getTarget(step.target);
      if (current && current !== target) setTarget(current);
      if (!current && !target.isConnected) {
        setRect(null);
        void onTargetMissing();
        return;
      }
      scheduleMeasure();
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("scroll", scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, [measure, onTargetMissing, step.target, target]);

  useEffect(() => {
    if (!rect || !tooltipRef.current) return;
    setTooltipPosition(
      getTooltipPosition(
        step.placement ?? "auto",
        rect,
        tooltipRef.current
      )
    );
  }, [rect, step.placement]);

  const isReady = Boolean(rect);

  useEffect(() => {
    if (!isReady || !tooltipRef.current) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    tooltipRef.current.focus({ preventScroll: true });

    return () => {
      const previous = previouslyFocusedRef.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [isReady, step.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (primaryCustomAction) {
          void onCustomAction();
        } else {
          void onNext();
        }
        return;
      }
      if (event.key === "ArrowLeft" && stepIndex > 0) {
        event.preventDefault();
        void onPrevious();
        return;
      }
      if (event.key !== "Tab" || !tooltipRef.current) return;

      const focusable = Array.from(
        tooltipRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        tooltipRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onCustomAction, onNext, onPrevious, primaryCustomAction, stepIndex]);

  if (!mounted || !step) return null;

  const titleId = `tour-title-${tour.id}-${step.id}`;
  const descriptionId = `tour-description-${tour.id}-${step.id}`;
  const isLastStep = stepIndex === tour.steps.length - 1;

  return createPortal(
    <div className={styles.root} aria-live="polite">
      {rect ? (
        <>
          <div
            className={styles.shade}
            style={{ top: 0, left: 0, width: "100%", height: rect.top }}
          />
          <div
            className={styles.shade}
            style={{
              top: rect.top,
              left: 0,
              width: rect.left,
              height: rect.height,
            }}
          />
          <div
            className={styles.shade}
            style={{
              top: rect.top,
              left: rect.right,
              width: Math.max(0, window.innerWidth - rect.right),
              height: rect.height,
            }}
          />
          <div
            className={styles.shade}
            style={{
              top: rect.bottom,
              left: 0,
              width: "100%",
              height: Math.max(0, window.innerHeight - rect.bottom),
            }}
          />
          <div
            className={styles.highlight}
            aria-hidden="true"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
          />
          <div
            ref={tooltipRef}
            className={styles.tooltip}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            style={{
              top: tooltipPosition?.top ?? EDGE_GAP,
              left: tooltipPosition?.left ?? EDGE_GAP,
              visibility: tooltipPosition ? "visible" : "hidden",
            }}
          >
            <h2 id={titleId} className={styles.title}>
              {step.title}
            </h2>
            <p id={descriptionId} className={styles.description}>
              {step.description}
            </p>
            {step.customAction && !primaryCustomAction ? (
              <button
                type="button"
                className={`${styles.button} ${styles.customButton}`}
                onClick={() => void onCustomAction()}
              >
                {step.customAction.label}
              </button>
            ) : null}
            <div className={styles.footer}>
              <span className={styles.stepCount} dir="ltr">
                {stepIndex + 1} / {tour.steps.length}
              </span>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.skipButton}`}
                  onClick={() => void onSkip()}
                >
                  رد کردن
                </button>
                {stepIndex > 0 ? (
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => void onPrevious()}
                  >
                    قبلی
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`${styles.button} ${styles.primaryButton}`}
                  onClick={() =>
                    void (primaryCustomAction ? onCustomAction() : onNext())
                  }
                >
                  {primaryCustomAction
                    ? primaryCustomAction.label
                    : isLastStep
                      ? "پایان"
                      : "بعدی"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            className={styles.shade}
            style={{ inset: 0 }}
            aria-hidden="true"
          />
          <div className={styles.loading} role="status">
            در حال آماده‌سازی راهنما…
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
