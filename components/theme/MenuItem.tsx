"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { getMenuImagePath } from "@/lib/theme/menuImageFiles";
import type { MenuItemPresentation } from "@/lib/theme/types";

type MenuItemProps = {
  presentation: MenuItemPresentation;
  href?: string;
  onClick?: () => void;
  onNavigate?: () => void;
  className?: string;
  wrapperClassName?: string;
  priority?: boolean;
};

function MenuItemContent({
  presentation,
  themeId,
  priority = false,
}: {
  presentation: MenuItemPresentation;
  themeId: ReturnType<typeof useTheme>["themeId"];
  priority?: boolean;
}) {
  if (presentation.kind === "image") {
    return (
      <Image
        src={getMenuImagePath(themeId, presentation.imageKey)}
        alt={presentation.alt}
        className="theme-menu-item__image"
        width={320}
        height={120}
        style={{ width: "100%", height: "auto" }}
        priority={priority}
      />
    );
  }

  return (
    <div className="theme-menu-item__styledBody">
      <div className="theme-menu-item__overlay" aria-hidden />
      <span className="theme-menu-item__titleFa theme-menu-item__text">
        {presentation.titleFa}
      </span>
      {presentation.titleEn ? (
        <span className="theme-menu-item__titleEn theme-menu-item__text">
          {presentation.titleEn}
        </span>
      ) : null}
    </div>
  );
}

export default function MenuItem({
  presentation,
  href,
  onClick,
  onNavigate,
  className = "",
  wrapperClassName = "",
  priority = false,
}: MenuItemProps) {
  const { themeId } = useTheme();
  const itemClassName = ["theme-menu-item", className].filter(Boolean).join(" ");

  const content = (
    <MenuItemContent
      presentation={presentation}
      themeId={themeId}
      priority={priority}
    />
  );

  if (href) {
    return (
      <Link
        href={href}
        className={wrapperClassName || undefined}
        onClick={() => onNavigate?.()}
      >
        <div className={itemClassName}>{content}</div>
      </Link>
    );
  }

  return (
    <div className={wrapperClassName || undefined}>
      <div
        className={itemClassName}
        onClick={() => {
          onNavigate?.();
          onClick?.();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onNavigate?.();
            onClick?.();
          }
        }}
      >
        {content}
      </div>
    </div>
  );
}
