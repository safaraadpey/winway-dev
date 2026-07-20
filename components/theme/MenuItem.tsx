"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { getMenuImagePath } from "@/lib/theme/menuImageFiles";
import type { MenuItemId, MenuItemPresentation } from "@/lib/theme/types";
import MenuLiveBadge from "@/components/theme/MenuLiveBadge";

type MenuItemProps = {
  presentation: MenuItemPresentation;
  menuItemId?: MenuItemId;
  href?: string;
  onClick?: () => void;
  onNavigate?: () => void;
  className?: string;
  wrapperClassName?: string;
  priority?: boolean;
  liveCount?: number;
  tourTargetId?: string;
};

function MenuItemContent({
  presentation,
  themeId,
  priority = false,
  liveCount,
}: {
  presentation: MenuItemPresentation;
  themeId: ReturnType<typeof useTheme>["themeId"];
  priority?: boolean;
  liveCount?: number;
}) {
  if (presentation.kind === "image") {
    return (
      <>
        <Image
          src={getMenuImagePath(themeId, presentation.imageKey)}
          alt={presentation.alt}
          className="theme-menu-item__image"
          width={320}
          height={120}
          style={{ width: "100%", height: "auto" }}
          priority={priority}
        />
        {liveCount != null ? <MenuLiveBadge count={liveCount} /> : null}
      </>
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
  menuItemId,
  href,
  onClick,
  onNavigate,
  className = "",
  wrapperClassName = "",
  priority = false,
  liveCount,
  tourTargetId,
}: MenuItemProps) {
  const { themeId } = useTheme();
  const itemClassName = ["theme-menu-item", className].filter(Boolean).join(" ");

  const itemProps = {
    ...(menuItemId ? { "data-menu-item": menuItemId } : {}),
    ...(tourTargetId ? { "data-tour-id": tourTargetId } : {}),
  };

  const content = (
    <MenuItemContent
      presentation={presentation}
      themeId={themeId}
      priority={priority}
      liveCount={liveCount}
    />
  );

  if (href) {
    return (
      <Link
        href={href}
        className={wrapperClassName || undefined}
        onClick={() => onNavigate?.()}
      >
        <div className={itemClassName} {...itemProps}>{content}</div>
      </Link>
    );
  }

  return (
    <div className={wrapperClassName || undefined}>
      <div
        className={itemClassName}
        {...itemProps}
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
