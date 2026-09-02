import type { DevPlayerRepo } from "../../repositories/devPlayerRepo.js";
import type { Logger } from "../../metrics/logger.js";
import { isPlayerEligibleForTemplate } from "./playerProfileEligibility.js";
import { scheduledAtWithJoinDelay } from "./joinDelay.js";
import { pickDevPlayerForJoin } from "./selectDevPlayer.js";
import { isTemplateJoinable, passesDevPlayerMaxPerRoomGate } from "./templateGates.js";
import { rollTicketCount } from "./ticketRoll.js";
import type {
  BuildScheduleBatchOptions,
  BuildScheduleBatchResult,
  DevPlayerConfigSnapshot,
  DevPlayerSettingsSnapshot,
  RoomTemplateSnapshot,
  ScheduleInsertRow,
} from "./types.js";

const ENGINE_MIN_WALLET_BALANCE = 0;
const ENGINE_AUTO_APPROVE_SCHEDULES = true;
const ENGINE_JOIN_FILTER = {
  excludeVip: true,
  excludeTournament: true,
} as const;

/** Random 1..template max_cards_per_player (default cap 2). */
function rollTicketCountForJoin(template: RoomTemplateSnapshot): number {
  const templateMax =
    template.maxCardsPerPlayer != null &&
    Number.isFinite(template.maxCardsPerPlayer) &&
    template.maxCardsPerPlayer > 0
      ? template.maxCardsPerPlayer
      : 2;
  return rollTicketCount(2, templateMax);
}

function emptySkipped(): BuildScheduleBatchResult["skipped"] {
  return {
    systemOff: 0,
    outsidePresetWindow: 0,
    outsidePlayerWindow: 0,
    wallet: 0,
    priceRange: 0,
    templateFiltered: 0,
    duplicatePending: 0,
    noEligiblePlayer: 0,
    noDistinctBot: 0,
    dripNotDue: 0,
    templateJoinPending: 0,
    devPlayerCapReached: 0,
    insertBudgetExhausted: 0,
    cycleIdle: 0,
  };
}

function buildPlayerCandidates(
  players: DevPlayerConfigSnapshot[],
  template: RoomTemplateSnapshot,
  settings: DevPlayerSettingsSnapshot,
  walletBalances: Map<string, number>,
  now: Date,
  skipped: BuildScheduleBatchResult["skipped"]
): DevPlayerConfigSnapshot[] {
  const candidates: DevPlayerConfigSnapshot[] = [];
  for (const player of players) {
    const eligibility = isPlayerEligibleForTemplate(player, template, settings, now);
    if (!eligibility.ok) {
      skipped[eligibility.reason] += 1;
      continue;
    }
    const balance = walletBalances.get(player.userId) ?? 0;
    if (balance < ENGINE_MIN_WALLET_BALANCE) {
      skipped.wallet += 1;
      continue;
    }
    candidates.push(player);
  }
  return candidates;
}

async function tryScheduleOne(args: {
  repo: DevPlayerRepo;
  templateId: string;
  template: RoomTemplateSnapshot;
  joinDelayMaxSeconds: number;
  players: DevPlayerConfigSnapshot[];
  walletBalances: Map<string, number>;
  settings: DevPlayerSettingsSnapshot;
  excludedUserIds: Set<string>;
  now: Date;
  skipped: BuildScheduleBatchResult["skipped"];
}): Promise<ScheduleInsertRow | null> {
  const candidates = buildPlayerCandidates(
    args.players,
    args.template,
    args.settings,
    args.walletBalances,
    args.now,
    args.skipped
  );

  if (candidates.length === 0) {
    args.skipped.noEligiblePlayer += 1;
    return null;
  }

  const maxAttempts = candidates.length;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const picked = pickDevPlayerForJoin(candidates, args.excludedUserIds);
    if (!picked) {
      args.skipped.noDistinctBot += 1;
      return null;
    }

    args.excludedUserIds.add(picked.userId);

    if (await args.repo.hasPendingSchedule(picked.userId, args.templateId)) {
      args.skipped.duplicatePending += 1;
      continue;
    }

    return {
      userId: picked.userId,
      roomTemplateId: args.templateId,
      ticketCount: rollTicketCountForJoin(args.template),
      scheduledAt: scheduledAtWithJoinDelay(args.now, args.joinDelayMaxSeconds),
      status: ENGINE_AUTO_APPROVE_SCHEDULES ? "approved" : "draft",
      createdBy: picked.userId,
    };
  }

  args.skipped.noEligiblePlayer += 1;
  return null;
}

/**
 * Profile-only Dev Player Manager: schedules joins from engine-enabled profiles.
 */
export async function runDevPlayerManager(
  repo: DevPlayerRepo,
  log: Logger,
  now: Date = new Date(),
  options: BuildScheduleBatchOptions = { maxInsertsPerTick: 10 }
): Promise<BuildScheduleBatchResult> {
  const skipped = emptySkipped();
  const maxInsertsPerTick = Math.max(1, options.maxInsertsPerTick);

  const settingsBundle = await repo.getSettingsWithRuntime();
  if (!settingsBundle) {
    skipped.systemOff = 1;
    return { created: 0, skipped };
  }

  const { settings } = settingsBundle;
  if (!settings.systemEnabled || !settings.schedulerEnabled) {
    skipped.systemOff = 1;
    return { created: 0, skipped };
  }

  const enabledProfiles = await repo.getEngineEnabledProfiles();
  if (enabledProfiles.length === 0) {
    skipped.cycleIdle = 1;
    return { created: 0, skipped };
  }

  const [players, templates, joinSettings] = await Promise.all([
    repo.getEnabledPlayerConfigs(),
    repo.getTemplatesForEnabledProfiles(),
    repo.getTemplateJoinSettings(),
  ]);

  if (players.length === 0 || templates.length === 0) {
    skipped.cycleIdle = 1;
    return { created: 0, skipped };
  }

  const devPlayerUserIds = players.map((player) => player.userId);
  const occupiedDevPlayerIds = await repo.getOccupiedDevPlayerIds(devPlayerUserIds);

  const walletBalances = new Map<string, number>();
  await Promise.all(
    players.map(async (player) => {
      walletBalances.set(player.userId, await repo.getWalletBalance(player.userId));
    })
  );

  const inserts: ScheduleInsertRow[] = [];
  let insertBudget = maxInsertsPerTick;
  const excludedUserIds = new Set<string>(occupiedDevPlayerIds);
  const joinTargetCounts = await repo.getJoinTargetRoomPlayerCounts(
    templates.map((template) => template.id),
    players.map((player) => player.userId)
  );

  for (const template of templates) {
    if (insertBudget <= 0) {
      skipped.insertBudgetExhausted += 1;
      break;
    }

    if (!isTemplateJoinable(template, ENGINE_JOIN_FILTER)) {
      skipped.templateFiltered += 1;
      continue;
    }

    const joinTarget = joinTargetCounts.get(template.id) ?? {
      devPlayers: 0,
      normalPlayers: 0,
    };
    const maxDevPlayersPerRoom = repo.getMaxDevPlayersPerRoom(template.id, joinSettings);
    if (!passesDevPlayerMaxPerRoomGate(joinTarget.devPlayers, maxDevPlayersPerRoom)) {
      skipped.devPlayerCapReached += 1;
      continue;
    }

    if (await repo.hasPendingScheduleForTemplate(template.id)) {
      skipped.templateJoinPending += 1;
      continue;
    }

    const joinDelayMaxSeconds = repo.getJoinDelayMaxSeconds(template.id, joinSettings);

    const row = await tryScheduleOne({
      repo,
      templateId: template.id,
      template,
      joinDelayMaxSeconds,
      players,
      walletBalances,
      settings,
      excludedUserIds,
      now,
      skipped,
    });

    if (row) {
      inserts.push(row);
      insertBudget -= 1;
    }
  }

  const created = inserts.length > 0 ? await repo.insertSchedules(inserts) : 0;

  if (created > 0 || skipped.devPlayerCapReached > 0) {
    log.info("dev-player-manager tick", {
      created,
      enabledProfileCount: enabledProfiles.length,
      templateCount: templates.length,
      playerCount: players.length,
      insertBudgetUsed: maxInsertsPerTick - insertBudget,
      skipped,
    });
  }

  return { created, skipped };
}
