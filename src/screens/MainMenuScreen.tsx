"use client";

import React from "react";
import { hardExit } from "@/lib/auth/hardExit";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { MENU_ENTRIES } from "@/lib/theme/menuEntries";
import InstallAppButton from "@/components/InstallAppButton";
import MenuItem from "@/components/theme/MenuItem";
import styles from "./MainMenuScreen.module.css";

const MainMenuScreen: React.FC = () => {
  const { themeDefinition } = useTheme();

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
        <div className={styles.menuList}>
          {fullWidthEntries.map((entry) => {
            const presentation = themeDefinition.menuItems[entry.id];
            return (
              <MenuItem
                key={entry.id}
                presentation={presentation}
                href={entry.href}
                onNavigate={() => handleMenuClick(entry.label)}
                className={styles.menuItemInteractive}
                priority
              />
            );
          })}

          <div className={styles.menuItemRow}>
            {halfWidthEntries.map((entry) => {
              const presentation = themeDefinition.menuItems[entry.id];
              return (
                <MenuItem
                  key={entry.id}
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
    </div>
  );
};

export default MainMenuScreen;
