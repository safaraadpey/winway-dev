import type { DevPlayerRepo } from "../../repositories/devPlayerRepo.js";
import type { Logger } from "../../metrics/logger.js";
import { isBehaviorCycleExpired } from "./behaviorState.js";
import { startNewBehaviorCycle } from "./behaviorCycle.js";
import { isDripDue, advanceDripNextJoinAt } from "./dripModes.js";
import {
  applyBurstOutcomeCounts,
  decrementFastFillAfterEmit,
} from "./fastFillBurst.js";
import { isWithinPlayWindow } from "./isWithinPlayWindow.js";
import { pickDevPlayerForJoin } from "./selectDevPlayer.js";
import { isPriceInPlayerRange, isTemplateJoinable } from "./templateGates.js";
import { rollTicketCount } from "./ticketRoll.js";
import type {
  BuildScheduleBatchOptions,
  BuildScheduleBatchResult,
  DevPlayerConfigSnapshot,
  DevPlayerJoinPresetSnapshot,
  DevPlayerSettingsSnapshot,
  RoomTemplateSnapshot,
  ScheduleInsertRow,
  SchedulerBehaviorState,
  TemplateBehaviorState,
} from "./types.js";

/** Random 1..min(player max, template max_cards_per_player). */
function rollTicketCountForJoin(
  player: DevPlayerConfigSnapshot,
  template: RoomTemplateSnapshot
): number {
  return rollTicketCount(player.maxTicketCount, template.maxCardsPerPlayer);
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
    insertBudgetExhausted: 0,
    cycleIdle: 0,
  };
}

function isPlayerEligibleForTemplate(
  player: DevPlayerConfigSnapshot,
  template: RoomTemplateSnapshot,
  preset: DevPlayerJoinPresetSnapshot,
  settings: DevPlayerSettingsSnapshot,
  now: Date
): { ok: true } | { ok: false; reason: "outsidePlayerWindow" | "priceRange" } {
  const playerWindows =
    player.playWindows.length > 0 ? player.playWindows : preset.playWindows;
  if (!isWithinPlayWindow(playerWindows, now, settings.timezone)) {
    return { ok: false, reason: "outsidePlayerWindow" };
  }
  if (!isPriceInPlayerRange(template.price, player.minRoomPrice, player.maxRoomPrice)) {
    return { ok: false, reason: "priceRange" };
  }
  return { ok: true };
}

function buildPlayerCandidates(
  players: DevPlayerConfigSnapshot[],
  template: RoomTemplateSnapshot,
  preset: DevPlayerJoinPresetSnapshot,
  settings: DevPlayerSettingsSnapshot,
  walletBalances: Map<string, number>,
  now: Date,
  skipped: BuildScheduleBatchResult["skipped"]
): DevPlayerConfigSnapshot[] {
  const candidates: DevPlayerConfigSnapshot[] = [];
  for (const player of players) {
    const eligibility = isPlayerEligibleForTemplate(
      player,
      template,
      preset,
      settings,
      now
    );
    if (!eligibility.ok) {
      skipped[eligibility.reason] += 1;
      continue;
    }
    const balance = walletBalances.get(player.userId) ?? 0;
    if (balance < preset.minWalletBalance) {
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
  preset: DevPlayerJoinPresetSnapshot;
  players: DevPlayerConfigSnapshot[];
  walletBalances: Map<string, number>;
  settings: DevPlayerSettingsSnapshot;
  excludedUserIds: Set<string>;
  now: Date;
  ticketCountForPlayer: (player: DevPlayerConfigSnapshot) => number;
  skipped: BuildScheduleBatchResult["skipped"];
}): Promise<ScheduleInsertRow | null> {
  const candidates = buildPlayerCandidates(
    args.players,
    args.template,
    args.preset,
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
      ticketCount: args.ticketCountForPlayer(picked),
      scheduledAt: args.now.toISOString(),
      status: args.preset.autoApproveSchedules ? "approved" : "draft",
      createdBy: picked.userId,
    };
  }

  args.skipped.noEligiblePlayer += 1;
  return null;
}

async function refreshBurstOutcomes(
  repo: DevPlayerRepo,
  templateId: string,
  state: TemplateBehaviorState,
  cycleStartedAt: string | null
): Promise<void> {
  if (state.mode !== "fast_fill_burst" || !cycleStartedAt) return;
  const counts = await repo.getScheduleOutcomeCountsSince(templateId, cycleStartedAt);
  applyBurstOutcomeCounts(state, counts);
}

/**
 * Counter-based Dev Player Manager (Hybrid Activity Strategy v1).
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

  if (!settings.activeJoinPresetId) {
    skipped.cycleIdle = 1;
    return { created: 0, skipped };
  }

  const preset = await repo.getJoinPreset(settings.activeJoinPresetId);
  if (!preset) {
    skipped.cycleIdle = 1;
    return { created: 0, skipped };
  }

  if (!isWithinPlayWindow(preset.playWindows, now, settings.timezone)) {
    skipped.outsidePresetWindow = 1;
    return { created: 0, skipped };
  }

  const [players, limits, templates] = await Promise.all([
    repo.getEnabledPlayerConfigs(),
    repo.getPresetTemplateLimits(preset.id),
    repo.getTemplatesByIds(preset.templateRoomLimitEnabledIds),
  ]);

  if (players.length === 0 || templates.length === 0) {
    skipped.cycleIdle = 1;
    return { created: 0, skipped };
  }

  const limitsByTemplate = new Map(limits.map((l) => [l.templateId, l]));
  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const devPlayerUserIds = players.map((p) => p.userId);

  const [waitingCounts, activeCounts, joinTargetCounts, occupiedDevPlayerIds] =
    await Promise.all([
      repo.getWaitingRoomCountsByTemplate(preset.templateRoomLimitEnabledIds),
      repo.getActiveRoomCountsByTemplate(preset.templateRoomLimitEnabledIds),
      repo.getJoinTargetRoomPlayerCounts(
        preset.templateRoomLimitEnabledIds,
        devPlayerUserIds
      ),
      repo.getOccupiedDevPlayerIds(devPlayerUserIds),
    ]);

  const runtimeByTemplate = new Map(
    preset.templateRoomLimitEnabledIds.map((templateId) => {
      const joinTarget = joinTargetCounts.get(templateId) ?? {
        devPlayers: 0,
        normalPlayers: 0,
      };
      return [
        templateId,
        {
          templateId,
          waitingRoomsCount: waitingCounts.get(templateId) ?? 0,
          activeRoomsCount: activeCounts.get(templateId) ?? 0,
          joinTargetDevPlayers: joinTarget.devPlayers,
          joinTargetNormalPlayers: joinTarget.normalPlayers,
        },
      ] as const;
    })
  );

  let behaviorState: SchedulerBehaviorState = settingsBundle.behaviorState;

  if (isBehaviorCycleExpired(behaviorState, now)) {
    behaviorState = startNewBehaviorCycle({
      now,
      preset,
      templatesById,
      limitsByTemplate,
      runtimeByTemplate,
      enabledPlayers: players,
      occupiedDevPlayerIds,
    });
  }

  const walletBalances = new Map<string, number>();
  await Promise.all(
    players.map(async (player) => {
      walletBalances.set(player.userId, await repo.getWalletBalance(player.userId));
    })
  );

  const inserts: ScheduleInsertRow[] = [];
  let insertBudget = maxInsertsPerTick;

  for (const templateId of preset.templateRoomLimitEnabledIds) {
    if (insertBudget <= 0) {
      skipped.insertBudgetExhausted += 1;
      break;
    }

    const templateState = behaviorState.templates[templateId];
    const template = templatesById.get(templateId);
    const limit = limitsByTemplate.get(templateId);

    if (!templateState || !template || !limit) {
      skipped.templateFiltered += 1;
      continue;
    }

    if (!isTemplateJoinable(template, preset)) {
      skipped.templateFiltered += 1;
      continue;
    }

    if (templateState.mode === "idle") {
      skipped.cycleIdle += 1;
      continue;
    }

    if (templateState.mode === "fast_fill_burst") {
      await refreshBurstOutcomes(
        repo,
        templateId,
        templateState,
        behaviorState.cycleStartedAt
      );

      const cycleScheduledUserIds = behaviorState.cycleStartedAt
        ? await repo.getScheduledUserIdsSince(templateId, behaviorState.cycleStartedAt)
        : new Set<string>();

      const excludedUserIds = new Set<string>([
        ...occupiedDevPlayerIds,
        ...cycleScheduledUserIds,
      ]);

      while (
        insertBudget > 0 &&
        (templateState.remainingJoins ?? 0) > 0
      ) {
        const row = await tryScheduleOne({
          repo,
          templateId,
          template,
          preset,
          players,
          walletBalances,
          settings,
          excludedUserIds,
          now,
          ticketCountForPlayer: (player) => rollTicketCountForJoin(player, template),
          skipped,
        });
        if (!row) break;
        inserts.push(row);
        insertBudget -= 1;
        decrementFastFillAfterEmit(templateState, 1);
      }

      await refreshBurstOutcomes(
        repo,
        templateId,
        templateState,
        behaviorState.cycleStartedAt
      );
      continue;
    }

    if (
      templateState.mode === "natural_join_drip" ||
      templateState.mode === "create_drip_light"
    ) {
      if (!isDripDue(templateState, now)) {
        skipped.dripNotDue += 1;
        continue;
      }

      if (insertBudget <= 0) {
        skipped.insertBudgetExhausted += 1;
        continue;
      }

      const excludedUserIds = new Set<string>(occupiedDevPlayerIds);

      const row = await tryScheduleOne({
        repo,
        templateId,
        template,
        preset,
        players,
        walletBalances,
        settings,
        excludedUserIds,
        now,
        ticketCountForPlayer: (player) => rollTicketCountForJoin(player, template),
        skipped,
      });

      if (row) {
        inserts.push(row);
        insertBudget -= 1;
      }

      advanceDripNextJoinAt(templateState, templateState.mode, now);
    }
  }

  const created = inserts.length > 0 ? await repo.insertSchedules(inserts) : 0;

  await repo.updateSchedulerBehaviorState(behaviorState);

  const burstStats: NonNullable<BuildScheduleBatchResult["behavior"]>["burstStats"] =
    {};
  for (const [templateId, state] of Object.entries(behaviorState.templates)) {
    if (state.mode !== "fast_fill_burst") continue;
    burstStats[templateId] = {
      burstRoomsTarget: state.burstRoomsTarget ?? 0,
      burstJoinsTarget: state.burstJoinsTarget ?? 0,
      burstJoinsScheduled: state.burstJoinsScheduled ?? 0,
      burstJoinsSucceeded: state.burstJoinsSucceeded ?? 0,
      burstJoinsFailed: state.burstJoinsFailed ?? 0,
      remainingJoins: state.remainingJoins ?? 0,
    };
  }

  if (created > 0 || Object.keys(burstStats).length > 0) {
    log.info("dev-player-manager tick", {
      created,
      cycleEndsAt: behaviorState.cycleEndsAt,
      burstStats,
      insertBudgetUsed: maxInsertsPerTick - insertBudget,
      skipped,
    });
  }

  return {
    created,
    skipped,
    behavior: {
      cycleEndsAt: behaviorState.cycleEndsAt,
      burstStats:
        Object.keys(burstStats).length > 0 ? burstStats : undefined,
    },
  };
}
