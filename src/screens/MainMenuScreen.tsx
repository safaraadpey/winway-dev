"use client";

import React from "react";
import { hardExit } from "@/lib/auth/hardExit";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { MENU_ENTRIES } from "@/lib/theme/menuEntries";
import InstallAppButton from "@/components/InstallAppButton";
import MenuItem from "@/components/theme/MenuItem";
import { useMenuLiveCounts } from "@/lib/hooks/useMenuLiveCounts";
import styles from "./MainMenuScreen.module.css";

const MENU_LIVE_COUNT_BY_ID = {
  gameRoom: "gameRoomActivePlayers",
  tournaments: "tournamentRegistrants",
} as const;

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

  const fullWidthEntries = MENU_ENTRIES.filter((entry) => !entry.halfWidth);
  const halfWidthEntries = MENU_ENTRIES.filter((entry) => entry.halfWidth);

  return (
    <div className={`theme-menu-screen ${styles.mainMenu}`}>
      <div className={styles.mainMenuInner}>
        <div className={styles.installSection}>
          <InstallAppButton />
        </div>
        <div className={styles.menuScrollArea}>
          <div className={styles.menuList}>
            {fullWidthEntries.map((entry) => {
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
                  onNavigate={() => handleMenuClick(entry.label)}
                  className={styles.menuItemInteractive}
                  liveCount={liveCount}
                  priority
                />
              );
            })}
          </div>
        </div>

        <div className={styles.menuItemRow}>
          {halfWidthEntries.map((entry) => {
            const presentation = themeDefinition.menuItems[entry.id];
            return (
              <MenuItem
                key={entry.id}
                menuItemId={entry.id}
                presentation={presentation}
                href={entry.href}
                onClick={entry.action === "logout" ? hardExit : undefined}
                onNavigate={() => handleMenuClick(entry.label)}
                className={styles.menuItemInteractive}
                wrapperClassName={styles.menuItemHalf}
                priority
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MainMenuScreen;
