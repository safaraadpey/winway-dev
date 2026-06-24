import React from "react";

type MenuLiveBadgeProps = {
  count: number;
};

function UsersIcon() {
  return (
    <svg
      className="theme-menu-item__liveBadgeIcon"
      width="25.92"
      height="25.92"
      viewBox="0 0 48 36"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="9" r="4.5" stroke="currentColor" strokeWidth="2.8" />
      <path
        d="M4.5 30c0-5.2 3.4-8.5 7.5-8.5s7.5 3.3 7.5 8.5"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <circle cx="36" cy="9" r="4.5" stroke="currentColor" strokeWidth="2.8" />
      <path
        d="M28.5 30c0-5.2 3.4-8.5 7.5-8.5s7.5 3.3 7.5 8.5"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <circle cx="24" cy="11" r="5.5" stroke="currentColor" strokeWidth="3" />
      <path
        d="M13.5 33c0-6.4 4.2-10.5 10.5-10.5s10.5 4.1 10.5 10.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function MenuLiveBadge({ count }: MenuLiveBadgeProps) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className="theme-menu-item__liveBadge" aria-hidden>
      <span className="theme-menu-item__liveBadgeCount numeric-text">
        {count.toLocaleString("en-US")}
      </span>
      <UsersIcon />
    </span>
  );
}
