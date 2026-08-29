export type WatchInviteBannerMetaOverride = {
  use_override?: boolean;
  title?: string | null;
  caption?: string | null;
  image_url?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  is_enabled?: boolean | null;
};

export type WatchInviteBanner = {
  title: string;
  caption: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  isEnabled: boolean;
};

export type WatchInviteSession = {
  watchCode: number;
  inviteToken: string;
  tournamentId: string;
  tournamentTitle: string;
  referralCode: string;
  watchPath: string;
};

export type WatchTournamentActiveCard = {
  id: string;
  label: string;
  count: number;
};

export type WatchTournamentSnapshot = {
  watchCode: number;
  title: string;
  status: string | null;
  startAt: string | null;
  ticketPrice: number;
  guaranteedPrize: number;
  commissionRate: number;
  entryCurrency: string;
  minTicketsPerPlayer: number;
  maxTicketsPerPlayer: number;
  tableSizeMode: string | null;
  tableSizeFixed: number | null;
  tableSizeMin: number | null;
  tableSizeMax: number | null;
  laterRoundTableSizeMode: string | null;
  laterRoundTableSizeFixed: number | null;
  laterRoundTableSizeMin: number | null;
  laterRoundTableSizeMax: number | null;
  finalWinnersCount: number;
  minPlayersToStart: number;
  roundBreakEndsAt: string | null;
  playerCount: number;
  totalTickets: number;
  currentRoundNo: number | null;
  activeCards: WatchTournamentActiveCard[];
  tables: WatchTournamentTable[];
};

export type WatchTournamentTable = {
  id: string;
  prize: number;
  players: number;
  cardCount: number;
  roundNo: number | null;
  tableNo: number | null;
  status?: string | null;
  isFinished?: boolean;
};
