import React from "react";

type KycVerifiedBadgeProps = {
  className?: string;
  size?: number;
};

/** Green verified check badge shown next to KYC-approved player names. */
export default function KycVerifiedBadge({
  className,
  size = 14,
}: KycVerifiedBadgeProps) {
  return (
    <span
      className={className}
      title="احراز هویت شده"
      aria-label="احراز هویت شده"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#10b981",
        color: "#ffffff",
        lineHeight: 1,
      }}
    >
      <svg
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3.5 8.2L6.4 11l6.1-6.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
