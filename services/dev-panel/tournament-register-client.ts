import { callDevPanelApi } from "@/lib/devPanelApiClient";
import type {
  DevRegistrationCampaignDetail,
  DevTournamentRegisterActionResult,
  DevTournamentRegisterCancelPayload,
  DevTournamentRegisterImmediatePayload,
  DevTournamentRegisterOverview,
  DevTournamentRegisterPreviewPayload,
  DevTournamentRegisterPreviewResult,
  DevTournamentRegisterSchedulePayload,
} from "@/src/types/dev-tournament-register";

export async function loadTournamentRegisterOverview(): Promise<DevTournamentRegisterOverview> {
  return callDevPanelApi<DevTournamentRegisterOverview>("/api/dev-panel/tournament-register");
}

export async function loadRegistrationCampaignDetail(
  campaignId: string
): Promise<DevRegistrationCampaignDetail> {
  return callDevPanelApi<DevRegistrationCampaignDetail>(
    `/api/dev-panel/tournament-register/campaigns/${campaignId}`
  );
}

export async function previewTournamentRegistration(
  payload: DevTournamentRegisterPreviewPayload
): Promise<DevTournamentRegisterPreviewResult> {
  return callDevPanelApi<DevTournamentRegisterPreviewResult>(
    "/api/dev-panel/tournament-register/preview",
    { method: "POST", body: payload }
  );
}

export async function registerTournamentPlayersImmediate(
  payload: DevTournamentRegisterImmediatePayload
): Promise<DevTournamentRegisterActionResult> {
  return callDevPanelApi<DevTournamentRegisterActionResult>(
    "/api/dev-panel/tournament-register/immediate",
    { method: "POST", body: payload }
  );
}

export async function scheduleTournamentRegistration(
  payload: DevTournamentRegisterSchedulePayload
): Promise<DevTournamentRegisterActionResult> {
  return callDevPanelApi<DevTournamentRegisterActionResult>(
    "/api/dev-panel/tournament-register/schedule",
    { method: "POST", body: payload }
  );
}

export async function cancelTournamentRegistrationCampaign(
  payload: DevTournamentRegisterCancelPayload
): Promise<DevTournamentRegisterActionResult> {
  return callDevPanelApi<DevTournamentRegisterActionResult>(
    "/api/dev-panel/tournament-register/cancel",
    { method: "POST", body: payload }
  );
}
