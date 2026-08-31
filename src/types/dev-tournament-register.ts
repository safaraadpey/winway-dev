import type { RegistrationScheduleItem } from "@/lib/dev-panel/tournamentRegistrationSchedule";

export type DevTournamentRegisterTournament = {
  id: string;
  title: string;
  status: string;
  startAt: string | null;
  ticketPrice: number;
  minTicketsPerPlayer: number;
  maxTicketsPerPlayer: number;
  createdAt: string;
};

export type DevRegistrationScheduleRow = {
  id: string;
  batchId: string;
  tournamentId: string;
  tournamentTitle: string;
  userId: string;
  username: string;
  scheduledAt: string;
  status: "pending" | "registered" | "skipped" | "failed" | "cancelled";
  errorText: string | null;
  processedAt: string | null;
};

export type DevRegistrationCampaignStatus = "active" | "completed" | "cancelled";
export type DevRegistrationCampaignMode = "scheduled" | "immediate";

export type DevRegistrationCampaignSummary = {
  id: string;
  batchId: string | null;
  name: string;
  tournamentId: string;
  tournamentTitle: string;
  tournamentStartAt: string | null;
  operatorId: string | null;
  operatorName: string | null;
  registrationOpenTime: string;
  mode: DevRegistrationCampaignMode;
  status: DevRegistrationCampaignStatus;
  playerCount: number;
  pending: number;
  registered: number;
  skipped: number;
  failed: number;
  cancelled: number;
  createdAt: string;
};

export type DevRegistrationCampaignDetail = DevRegistrationCampaignSummary & {
  items: DevRegistrationScheduleRow[];
};

/** @deprecated use campaigns */
export type DevRegistrationBatchSummary = {
  batchId: string;
  tournamentId: string;
  tournamentTitle: string;
  createdAt: string;
  pending: number;
  registered: number;
  skipped: number;
  failed: number;
  cancelled: number;
  total: number;
};

export type DevTournamentRegisterOverview = {
  tournaments: DevTournamentRegisterTournament[];
  campaigns: DevRegistrationCampaignSummary[];
};

export type DevTournamentRegisterPreviewResult = {
  items: Array<{
    userId: string;
    username: string;
    scheduledAt: string;
  }>;
};

export type DevTournamentRegisterActionResult = {
  campaignId?: string;
  batchId?: string;
  results: Array<{
    username: string | null;
    userId: string;
    entryId: string | null;
    action: string;
    detail: string | null;
  }>;
  summary: {
    registered: number;
    skipped: number;
    failed: number;
    scheduled?: number;
    cancelled?: number;
  };
};

export type DevTournamentRegisterPreviewPayload = {
  tournamentId: string;
  registrationOpenTime: string;
  playerIds: string[];
};

export type DevTournamentRegisterSchedulePayload = {
  tournamentId: string;
  operatorId?: string;
  name?: string;
  registrationOpenTime?: string;
  items: RegistrationScheduleItem[] | Array<{ userId: string; scheduledAt: string }>;
};

export type DevTournamentRegisterImmediatePayload = {
  tournamentId: string;
  operatorId?: string;
  name?: string;
  registrationOpenTime?: string;
  playerIds: string[];
  qty?: number;
};

export type DevTournamentRegisterCancelPayload = {
  campaignId: string;
};
