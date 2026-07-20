"use client";

import React from "react";
import { hardExit } from "@/lib/auth/hardExit";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { MENU_ENTRIES } from "@/lib/theme/menuEntries";
import type { MenuEntryDefinition } from "@/lib/theme/types";
import InstallAppButton from "@/components/InstallAppButton";
import MenuItem from "@/components/theme/MenuItem";
import { useMenuLiveCounts } from "@/lib/hooks/useMenuLiveCounts";
import styles from "./MainMenuScreen.module.css";

const MENU_LIVE_COUNT_BY_ID = {
  gameRoom: "gameRoomActivePlayers",
  tournaments: "tournamentRegistrants",
} as const;

const PRIMARY_MENU_IDS = ["gameRoom", "tournaments", "leaderboard"] as const;
const ACCOUNT_MENU_IDS = ["myProfile", "settings", "reports"] as const;

const TOUR_TARGET_BY_ENTRY_ID: Partial<
  Record<MenuEntryDefinition["id"], string>
> = {
  gameRoom: "game-room",
  tournaments: "tournaments",
  leaderboard: "leaderboard",
  support: "support",
};

const MainMenuScreen: React.FC = () => {
  const { themeDefinition } = useTheme();
  const liveCounts = useMenuLiveCounts();

  const getLiveCount = (entryId: keyof typeof MENU_LIVE_COUNT_BY_ID): number => {
    const key = MENU_LIVE_COUNT_BY_ID[entryId];
    return liveCounts[key];
  };

  const handleMenuClick = (label: string): void => {
    console.log(`${label} clicked`);
  };

  const primaryEntries = MENU_ENTRIES.filter((entry) =>
    PRIMARY_MENU_IDS.includes(entry.id as (typeof PRIMARY_MENU_IDS)[number])
  );
  const accountEntries = MENU_ENTRIES.filter((entry) =>
    ACCOUNT_MENU_IDS.includes(entry.id as (typeof ACCOUNT_MENU_IDS)[number])
  );
  const halfWidthEntries = MENU_ENTRIES.filter((entry) => entry.halfWidth);

  const renderMenuItem = (entry: MenuEntryDefinition) => {
    const presentation = themeDefinition.menuItems[entry.id];
    const liveCount =
      entry.id in MENU_LIVE_COUNT_BY_ID
        ? getLiveCount(entry.id as keyof typeof MENU_LIVE_COUNT_BY_ID)
        : undefined;

    return (
      <MenuItem
        key={entry.id}
        menuItemId={entry.id}
        presentation={presentation}
        href={entry.href}
        onClick={entry.action === "logout" ? hardExit : undefined}
        onNavigate={() => handleMenuClick(entry.label)}
        className={styles.menuItemInteractive}
        wrapperClassName={entry.halfWidth ? styles.menuItemHalf : undefined}
        liveCount={liveCount}
        tourTargetId={TOUR_TARGET_BY_ENTRY_ID[entry.id]}
        priority
      />
    );
  };

  return (
    <div className={`theme-menu-screen ${styles.mainMenu}`}>
      <div className={styles.mainMenuInner}>
        <div className={styles.installSection}>
          <InstallAppButton />
        </div>
        <div className={styles.menuScrollArea}>
          <div className={styles.menuList}>
            {primaryEntries.map((entry) => renderMenuItem(entry))}
            <div
              className={styles.accountManagementGroup}
              data-tour-id="account-management"
            >
              {accountEntries.map((entry) => renderMenuItem(entry))}
            </div>
          </div>
        </div>

        <div className={styles.menuItemRow}>
          {halfWidthEntries.map((entry) => renderMenuItem(entry))}
        </div>
      </div>
    </div>
  );
};

export default MainMenuScreen;
