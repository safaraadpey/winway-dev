"use client";

import React from 'react';
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import InstallAppButton from "@/components/InstallAppButton";
import styles from './MainMenuScreen.module.css';

// Import menu banner images
import gameRoomImage from '../assets/menu/menu-game-room.png';
import tournamentImage from '../assets/menu/tournament.png';
import leaderboardImage from '../assets/menu/menu-leaderboard.png';
import myProfileImage from '../assets/menu/menu-my-profile.png';
import reportsImage from '../assets/menu/menu-reports.png';
import supportImage from '../assets/menu/support.png';
import logoutImage from '../assets/menu/menu-logout.png';

type MenuName =
  | 'Game Room'
  | 'Tournaments'
  | 'Leaderboard'
  | 'My Profile'
  | 'Financial Reports'
  | 'Support'
  | 'Logout';

const MainMenuScreen: React.FC = () => {
  const router = useRouter();

  const handleMenuClick = (menuName: MenuName): void => {
    console.log(`${menuName} clicked`);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push("/login");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  return (
    <div className={styles.mainMenu}>
      <div className={styles.mainMenuInner}>
        <div className={styles.installSection}>
          <InstallAppButton />
        </div>
        {/* Menu List */}
        <div className={styles.menuList}>
          <Link href="/player/lobby">
            <div 
              className={styles.menuItem}
              onClick={() => handleMenuClick('Game Room')}
              role="button"
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleMenuClick('Game Room');
                }
              }}
            >
              <Image 
                src={gameRoomImage} 
                alt="Game Room" 
                className={styles.menuImage}
                width={320}
                height={120}
                style={{ width: '100%', height: 'auto' }}
                priority
              />
            </div>
          </Link>

          <Link href="/player/tournaments">
            <div 
              className={styles.menuItem}
              onClick={() => handleMenuClick('Tournaments')}
              role="button"
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleMenuClick('Tournaments');
                }
              }}
            >
              <Image 
                src={tournamentImage} 
                alt="Tournaments" 
                className={styles.menuImage}
                width={320}
                height={120}
                style={{ width: '100%', height: 'auto' }}
                priority
              />
            </div>
          </Link>

          <Link href="/player/leaderboard">
            <div 
              className={styles.menuItem}
              onClick={() => handleMenuClick('Leaderboard')}
              role="button"
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleMenuClick('Leaderboard');
                }
              }}
            >
              <Image 
                src={leaderboardImage} 
                alt="Leaderboard" 
                className={styles.menuImage}
                width={320}
                height={120}
                style={{ width: '100%', height: 'auto' }}
                priority
              />
            </div>
          </Link>

          <Link href="/player/myprofile">
            <div 
              className={styles.menuItem}
              onClick={() => handleMenuClick('My Profile')}
              role="button"
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleMenuClick('My Profile');
                }
              }}
            >
              <Image 
                src={myProfileImage} 
                alt="My Profile" 
                className={styles.menuImage}
                width={320}
                height={120}
                style={{ width: '100%', height: 'auto' }}
                priority
              />
            </div>
          </Link>

          <Link href="/player/reports">
            <div 
              className={styles.menuItem}
              onClick={() => handleMenuClick('Financial Reports')}
              role="button"
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleMenuClick('Financial Reports');
                }
              }}
            >
              <Image 
                src={reportsImage} 
                alt="Financial Reports" 
                className={styles.menuImage}
                width={320}
                height={120}
                style={{ width: '100%', height: 'auto' }}
                priority
              />
            </div>
          </Link>

          {/* Support and Logout buttons side by side */}
          <div className={styles.menuItemRow}>
            <div 
              className={`${styles.menuItemHalf} ${styles.menuItem}`}
              onClick={handleLogout}
              role="button"
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleLogout();
                }
              }}
            >
              <Image 
                src={logoutImage} 
                alt="Logout" 
                className={styles.menuImage}
                width={320}
                height={120}
                style={{ width: '100%', height: 'auto' }}
                priority
              />
            </div>

            <Link href="/player/support" className={styles.menuItemHalf}>
              <div 
                className={styles.menuItem}
                onClick={() => handleMenuClick('Support')}
                role="button"
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleMenuClick('Support');
                  }
                }}
              >
                <Image 
                  src={supportImage} 
                  alt="Support" 
                  className={styles.menuImage}
                  width={320}
                  height={120}
                  style={{ width: '100%', height: 'auto' }}
                  priority
                />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainMenuScreen;

