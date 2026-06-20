import type { MenuImageMap } from "@/lib/theme/types";
import gameRoomImage from "@/src/assets/menu/menu-game-room.png";
import tournamentImage from "@/src/assets/menu/tournament.png";
import leaderboardImage from "@/src/assets/menu/menu-leaderboard.png";
import myProfileImage from "@/src/assets/menu/menu-my-profile.png";
import settingsImage from "@/src/assets/menu/settings.png";
import reportsImage from "@/src/assets/menu/menu-reports.png";
import supportImage from "@/src/assets/menu/support.png";
import logoutImage from "@/src/assets/menu/menu-logout.png";

export const MENU_IMAGES: MenuImageMap = {
  gameRoom: gameRoomImage,
  tournaments: tournamentImage,
  leaderboard: leaderboardImage,
  myProfile: myProfileImage,
  settings: settingsImage,
  reports: reportsImage,
  support: supportImage,
  logout: logoutImage,
};
