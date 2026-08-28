"use client";

import React from "react";
import { hardExit } from "@/lib/auth/hardExit";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { MENU_ENTRIES } from "@/lib/theme/menuEntries";
import type { MenuEntryDefinition } from "@/lib/theme/types";
import InstallAppButton from "@/components/InstallAppButton";
import TicTacToeLauncher from "@/components/tic-tac-toe/TicTacToeLauncher";
import MenuItem from "@/components/theme/MenuItem";
import { useMenuLiveCounts } from "@/lib/hooks/useMenuLiveCounts";
import styles from "./MainMenuScreen.module.css";

const MENU_LIVE_COUNT_BY_ID = {
  gameRoom: "gameRoomActivePlayers",
  tournaments: "tournamentRegistrants",
} as const;

const PLAY_MENU_IDS = ["gameRoom", "tournaments"] as const;
const ACCOUNT_MENU_IDS = ["myProfile", "settings"] as const;
const LEADERBOARD_MENU_ID = "leaderboard" as const;
const REPORTS_MENU_ID = "reports" as const;

const TOUR_TARGET_BY_ENTRY_ID: Partial<
  Record<MenuEntryDefinition["id"], string>
> = {
  gameRoom: "game-room",
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

  const gameRoomEntry = MENU_ENTRIES.find((entry) => entry.id === "gameRoom");
  const tournamentsEntry = MENU_ENTRIES.find(
    (entry) => entry.id === "tournaments"
  );
  const reportsEntry = MENU_ENTRIES.find(
    (entry) => entry.id === REPORTS_MENU_ID
  );
  const leaderboardEntry = MENU_ENTRIES.find(
    (entry) => entry.id === LEADERBOARD_MENU_ID
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
          <div style={{ marginTop: "0.5rem" }}>
            <TicTacToeLauncher placement="player_home" />
          </div>
        </div>
        <div className={styles.menuScrollArea}>
          <div className={styles.menuList}>
            <div
              className={styles.gameRoomTournamentsGroup}
              data-tour-id="game-room-and-tournaments"
            >
              {gameRoomEntry ? renderMenuItem(gameRoomEntry) : null}
              {tournamentsEntry ? renderMenuItem(tournamentsEntry) : null}
              {reportsEntry ? renderMenuItem(reportsEntry) : null}
            </div>
            <div
              className={styles.leaderboardAccountGroup}
              data-tour-id="leaderboard-and-account"
            >
              {leaderboardEntry
                ? renderMenuItem(leaderboardEntry)
                : null}
              <div className={styles.accountManagementGroup}>
                {accountEntries.map((entry) => renderMenuItem(entry))}
              </div>
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
