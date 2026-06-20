# Menu Banner Images

Theme menu banners live under `public/themes/<theme-id>/menu/`.

Current files (dark and light):

1. `menu-game-room.png` - Game Room banner
2. `tournament.png` - Tournaments banner
3. `menu-leaderboard.png` - Leaderboard banner
4. `menu-my-profile.png` - My Profile banner
5. `settings.png` - Settings banner
6. `menu-reports.png` - Financial Reports banner
7. `support.png` - Support banner
8. `menu-logout.png` - Logout banner

Resolved at runtime via `getMenuImagePath(themeId, imageKey)` in `lib/theme/menuImageFiles.ts`.
